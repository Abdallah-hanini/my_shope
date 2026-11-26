import { Inject, Injectable, Logger } from '@nestjs/common';
import type { CreateStaffInput, SetUserStatusInput } from '@erp/validation';
import type { CompanyScope, Principal } from '../auth/principal';
import { AuthzService } from '../authz/authz.service';
import { canDelegate } from '../authz/scope';
import { conflict, forbidden, notFound, unprocessable } from '../common/errors';
import { PrismaService } from '../infra/prisma.service';
import { isUniqueViolation } from '../org/org.service';
import { writeAudit, type AuditContext } from '../platform/audit';
import { enqueueOutbox } from '../platform/outbox';
import type { StaffCreatedDto, StaffMemberDto, TemporaryPasswordDto } from './iam.dto';
import { IamService } from './iam.service';
import {
  generateTemporaryPassword,
  IDENTITY_PROVISIONER,
  type IdentityProvisioner,
} from './identity-provisioner';

/**
 * Staff onboarding and account control for a company (WEB-224). A sign-in account is created in
 * the identity provider and linked to an ERP user; ERP permissions come only from role assignments.
 */
@Injectable()
export class StaffService {
  private readonly logger = new Logger(StaffService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthzService,
    private readonly iam: IamService,
    @Inject(IDENTITY_PROVISIONER) private readonly idp: IdentityProvisioner,
  ) {}

  async list(scope: CompanyScope): Promise<StaffMemberDto[]> {
    const rows = await this.prisma.roleAssignment.findMany({
      where: {
        companyId: scope.companyId,
        ...(scope.allBranches ? {} : { branchId: { in: scope.branchIds } }),
      },
      include: { user: true, role: true },
      orderBy: { createdAt: 'asc' },
    });
    const userIds = [...new Set(rows.map((r) => r.userId))];
    const elsewhere = new Set(
      (
        await this.prisma.roleAssignment.findMany({
          where: { userId: { in: userIds }, companyId: { not: scope.companyId } },
          select: { userId: true },
          distinct: ['userId'],
        })
      ).map((r) => r.userId),
    );
    const byUser = new Map<string, StaffMemberDto>();
    for (const r of rows) {
      const entry = byUser.get(r.userId) ?? {
        id: r.user.id,
        email: r.user.email,
        displayName: r.user.displayName,
        status: r.user.status,
        isPlatformAdmin: r.user.isPlatformAdmin,
        inOtherCompanies: elsewhere.has(r.userId),
        assignments: [],
      };
      entry.assignments.push({
        assignmentId: r.id,
        roleId: r.roleId,
        roleCode: r.role.code,
        roleName: r.role.name,
        roleNameAr: r.role.nameAr,
        branchId: r.branchId,
      });
      byUser.set(r.userId, entry);
    }
    return [...byUser.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  async get(scope: CompanyScope, userId: string): Promise<StaffMemberDto> {
    const member = (await this.list(scope)).find((m) => m.id === userId);
    if (!member) throw notFound('User');
    return member;
  }

  async create(
    scope: CompanyScope,
    p: Principal,
    input: CreateStaffInput,
    ctx: AuditContext,
  ): Promise<StaffCreatedDto> {
    const branchId = input.branchId ?? null;
    if (!scope.allBranches && (branchId === null || !scope.branchIds.includes(branchId))) {
      throw forbidden('You can only add staff to branches in your scope');
    }
    const [role, branch] = await Promise.all([
      this.prisma.role.findUnique({
        where: { companyId_id: { companyId: scope.companyId, id: input.roleId } },
      }),
      branchId
        ? this.prisma.branch.findUnique({
            where: { companyId_id: { companyId: scope.companyId, id: branchId } },
          })
        : null,
    ]);
    if (!role) throw unprocessable('roleId is not a role of this company');
    if (branchId && !branch) throw unprocessable('branchId is not a branch of this company');
    await this.iam.assertCanDelegate(scope.companyId, p, role.permissions, branchId);

    // 1. Sign-in account (identity provider). 2. ERP user + assignment (one transaction).
    // If step 2 fails, step 1 is undone so no orphan sign-in account is left behind.
    const subject = await this.idp.createUser({
      username: input.username,
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      locale: input.locale,
      requiredActions: input.requireOtp ? ['UPDATE_PASSWORD', 'CONFIGURE_TOTP'] : ['UPDATE_PASSWORD'],
    });
    const temporaryPassword = generateTemporaryPassword();
    try {
      await this.idp.setTemporaryPassword(subject, temporaryPassword);
      const user = await this.prisma.$transaction(async (tx) => {
        const u = await tx.user.create({
          data: {
            oidcIssuer: this.idp.issuer,
            oidcSubject: subject,
            email: input.email,
            displayName: `${input.firstName} ${input.lastName}`,
            locale: input.locale,
          },
        });
        const a = await tx.roleAssignment.create({
          data: { companyId: scope.companyId, userId: u.id, roleId: role.id, branchId, grantedBy: p.userId },
        });
        await writeAudit(tx, ctx, {
          action: 'iam.user.onboard',
          entityType: 'user',
          entityId: u.id,
          companyId: scope.companyId,
          branchId,
          // Never the password; only that a temporary one was issued.
          after: {
            username: input.username,
            email: input.email,
            displayName: u.displayName,
            roleCode: role.code,
            branchId,
            assignmentId: a.id,
            requireOtp: input.requireOtp,
            temporaryPasswordIssued: true,
          },
        });
        await enqueueOutbox(tx, {
          companyId: scope.companyId,
          aggregateType: 'user',
          aggregateId: u.id,
          eventType: 'iam.user.onboarded',
          payload: { userId: u.id, roleId: role.id, branchId },
        });
        return u;
      });
      return { user: await this.get(scope, user.id), temporaryPassword };
    } catch (err) {
      // Undo only an account no ERP user is linked to; never delete someone else's sign-in.
      const linked = await this.prisma.user.findUnique({
        where: { oidcIssuer_oidcSubject: { oidcIssuer: this.idp.issuer, oidcSubject: subject } },
      });
      if (linked) {
        this.logger.error(
          `identity provider returned subject ${subject}, which is already linked; not deleting it`,
        );
      } else {
        await this.idp
          .deleteUser(subject)
          .catch((e: unknown) =>
            this.logger.error(
              `could not remove sign-in account ${subject} after a failed onboarding: ${String(e)}`,
            ),
          );
      }
      if (isUniqueViolation(err)) throw conflict('This sign-in account is already linked to an ERP user');
      throw err;
    }
  }

  async resetPassword(
    scope: CompanyScope,
    p: Principal,
    userId: string,
    ctx: AuditContext,
  ): Promise<TemporaryPasswordDto> {
    const target = await this.assertManageable(scope, p, userId);
    const temporaryPassword = generateTemporaryPassword();
    await this.idp.setTemporaryPassword(target.oidcSubject, temporaryPassword);
    await this.idp.logoutSessions(target.oidcSubject);
    await this.prisma.$transaction((tx) =>
      writeAudit(tx, ctx, {
        action: 'iam.user.reset-password',
        entityType: 'user',
        entityId: target.id,
        companyId: scope.companyId,
        after: { temporaryPasswordIssued: true, sessionsEnded: true },
      }),
    );
    return { temporaryPassword };
  }

  /**
   * Deactivation is enforced by the ERP (every request checks the user status) and by Keycloak
   * (account disabled, sessions ended). The identity provider is changed first; if the ERP update
   * then fails, the identity change is reverted.
   */
  async setStatus(
    scope: CompanyScope,
    p: Principal,
    userId: string,
    input: SetUserStatusInput,
    ctx: AuditContext,
  ): Promise<StaffMemberDto> {
    const target = await this.assertManageable(scope, p, userId);
    if (target.status === input.status) throw conflict(`User is already ${input.status}`);
    const enable = input.status === 'active';
    await this.idp.setEnabled(target.oidcSubject, enable);
    if (!enable) await this.idp.logoutSessions(target.oidcSubject);
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: target.id },
          data: { status: input.status, version: { increment: 1 } },
        });
        await writeAudit(tx, ctx, {
          action: enable ? 'iam.user.activate' : 'iam.user.deactivate',
          entityType: 'user',
          entityId: target.id,
          companyId: scope.companyId,
          reason: input.reason,
          before: { status: target.status },
          after: { status: input.status },
        });
        await enqueueOutbox(tx, {
          companyId: scope.companyId,
          aggregateType: 'user',
          aggregateId: target.id,
          eventType: enable ? 'iam.user.activated' : 'iam.user.deactivated',
          payload: { userId: target.id },
        });
      });
    } catch (err) {
      await this.idp
        .setEnabled(target.oidcSubject, !enable)
        .catch((e: unknown) =>
          this.logger.error(`could not revert sign-in account ${target.oidcSubject}: ${String(e)}`),
        );
      throw err;
    }
    return this.get(scope, target.id);
  }

  /**
   * A company administrator may manage an account only when it is entirely within their
   * authority: it belongs to this company only, is not a platform administrator, is not their
   * own, and every role it holds here is one they could grant. Platform administrators may manage
   * any account except their own.
   */
  private async assertManageable(scope: CompanyScope, p: Principal, userId: string) {
    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { roleAssignments: { include: { role: true } } },
    });
    const here = target?.roleAssignments.filter((a) => a.companyId === scope.companyId) ?? [];
    if (!target || here.length === 0) throw notFound('User');
    if (
      !scope.allBranches &&
      !here.every((a) => a.branchId !== null && scope.branchIds.includes(a.branchId))
    ) {
      throw notFound('User');
    }
    if (target.id === p.userId)
      throw unprocessable('You cannot change your own account here; use your Keycloak account settings');
    if (target.oidcIssuer !== this.idp.issuer) {
      throw unprocessable('This account belongs to a different sign-in provider and cannot be managed here');
    }
    if (!p.isPlatformAdmin) {
      if (target.isPlatformAdmin) throw forbidden('Only a platform administrator can manage this account');
      if (target.roleAssignments.some((a) => a.companyId !== scope.companyId)) {
        throw forbidden('This person also works for another company; ask a platform administrator');
      }
      const grants = await this.authz.grants(p.userId, scope.companyId);
      if (!here.every((a) => canDelegate(scope.companyId, grants, a.role.permissions, a.branchId))) {
        throw forbidden('This person holds permissions beyond your own');
      }
    }
    return target;
  }
}
