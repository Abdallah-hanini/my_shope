import { Injectable } from '@nestjs/common';
import type { Role, RoleAssignment, User } from '@prisma/client';
import {
  isCompanyPermission,
  type CreateRoleAssignmentInput,
  type CreateRoleInput,
  type CreateUserInput,
  type UpdateRoleInput,
} from '@erp/validation';
import type { CompanyScope, Principal } from '../auth/principal';
import { AuthzService } from '../authz/authz.service';
import { canDelegate } from '../authz/scope';
import { conflict, forbidden, notFound, unprocessable } from '../common/errors';
import { PrismaService } from '../infra/prisma.service';
import { isUniqueViolation } from '../org/org.service';
import { writeAudit, type AuditContext } from '../platform/audit';
import { enqueueOutbox } from '../platform/outbox';
import type { MeDto, RoleAssignmentDto, RoleDto, UserDto } from './iam.dto';

export const toUserDto = (u: User): UserDto => ({
  id: u.id,
  email: u.email,
  displayName: u.displayName,
  locale: u.locale,
  isPlatformAdmin: u.isPlatformAdmin,
  status: u.status,
});
const toRoleDto = (r: Role & { _count?: { assignments: number } }): RoleDto => ({
  id: r.id,
  companyId: r.companyId,
  code: r.code,
  name: r.name,
  nameAr: r.nameAr,
  permissions: r.permissions,
  isSystem: r.isSystem,
  version: r.version,
  memberCount: r._count?.assignments ?? 0,
});
const toAssignmentDto = (a: RoleAssignment): RoleAssignmentDto => ({
  id: a.id,
  companyId: a.companyId,
  userId: a.userId,
  roleId: a.roleId,
  branchId: a.branchId,
  grantedBy: a.grantedBy,
  createdAt: a.createdAt.toISOString(),
});

@Injectable()
export class IamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthzService,
  ) {}

  async me(p: Principal): Promise<MeDto> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: p.userId } });
    const assignments = await this.prisma.roleAssignment.findMany({
      where: { userId: p.userId, company: { status: 'active' } },
      include: { role: true, company: true },
      orderBy: [{ companyId: 'asc' }, { createdAt: 'asc' }],
    });
    const byCompany = new Map<string, MeDto['companies'][number]>();
    for (const a of assignments) {
      const entry = byCompany.get(a.companyId) ?? {
        companyId: a.companyId,
        code: a.company.code,
        legalName: a.company.legalName,
        legalNameAr: a.company.legalNameAr,
        assignments: [],
        permissions: [],
      };
      entry.assignments.push({ assignmentId: a.id, roleCode: a.role.code, branchId: a.branchId });
      entry.permissions = [...new Set([...entry.permissions, ...a.role.permissions])].sort();
      byCompany.set(a.companyId, entry);
    }
    return { user: toUserDto(user), companies: [...byCompany.values()] };
  }

  async createUser(input: CreateUserInput, ctx: AuditContext): Promise<UserDto> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({ data: { ...input } });
        await writeAudit(tx, ctx, {
          action: 'iam.user.create',
          entityType: 'user',
          entityId: user.id,
          after: user,
        });
        return toUserDto(user);
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict('A user with this issuer and subject already exists');
      throw err;
    }
  }

  async createRole(
    scope: CompanyScope,
    p: Principal,
    input: CreateRoleInput,
    ctx: AuditContext,
  ): Promise<RoleDto> {
    const unknown = input.permissions.filter((x) => !isCompanyPermission(x));
    if (unknown.length) throw unprocessable(`Unknown permissions: ${unknown.join(', ')}`);
    const permissions = [...new Set(input.permissions)].sort();
    // A role is a company-wide template: defining it requires holding its permissions company-wide.
    if (!p.isPlatformAdmin) {
      const grants = await this.authz.grants(p.userId, scope.companyId);
      if (!canDelegate(scope.companyId, grants, permissions, null)) {
        throw forbidden('You can only define roles with permissions you hold for the whole company');
      }
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const role = await tx.role.create({
          data: {
            companyId: scope.companyId,
            code: input.code,
            name: input.name,
            nameAr: input.nameAr ?? null,
            permissions,
          },
        });
        await writeAudit(tx, ctx, {
          action: 'iam.role.create',
          entityType: 'role',
          entityId: role.id,
          companyId: scope.companyId,
          after: role,
        });
        return toRoleDto(role);
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict(`Role code ${input.code} already exists in this company`);
      throw err;
    }
  }

  async listRoles(scope: CompanyScope): Promise<RoleDto[]> {
    const rows = await this.prisma.role.findMany({
      where: { companyId: scope.companyId },
      orderBy: { code: 'asc' },
      include: { _count: { select: { assignments: true } } },
    });
    return rows.map(toRoleDto);
  }

  /**
   * Changes a role's name and permissions (effective on the next request of every holder).
   * System roles are fixed. Non-platform administrators must hold, company-wide, every permission
   * being added or removed, so editing a role can never be used to escalate.
   */
  async updateRole(
    scope: CompanyScope,
    p: Principal,
    roleId: string,
    input: UpdateRoleInput,
    ctx: AuditContext,
  ): Promise<RoleDto> {
    const role = await this.prisma.role.findUnique({
      where: { companyId_id: { companyId: scope.companyId, id: roleId } },
    });
    if (!role) throw notFound('Role');
    if (role.isSystem) throw forbidden('System roles cannot be changed');
    const unknown = input.permissions.filter((x) => !isCompanyPermission(x));
    if (unknown.length) throw unprocessable(`Unknown permissions: ${unknown.join(', ')}`);
    const permissions = [...new Set(input.permissions)].sort();
    if (!p.isPlatformAdmin) {
      const grants = await this.authz.grants(p.userId, scope.companyId);
      const touched = [...new Set([...permissions, ...role.permissions])];
      if (!canDelegate(scope.companyId, grants, touched, null)) {
        throw forbidden('You can only change permissions you hold for the whole company');
      }
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.role.updateMany({
        where: { id: role.id, companyId: scope.companyId, version: input.version },
        data: { name: input.name, nameAr: input.nameAr ?? null, permissions, version: { increment: 1 } },
      });
      if (updated.count !== 1) throw conflict(`Role changed (version ${role.version}); reload and retry`);
      const after = await tx.role.findUniqueOrThrow({
        where: { id: role.id },
        include: { _count: { select: { assignments: true } } },
      });
      await writeAudit(tx, ctx, {
        action: 'iam.role.update',
        entityType: 'role',
        entityId: role.id,
        companyId: scope.companyId,
        before: { name: role.name, nameAr: role.nameAr, permissions: role.permissions },
        after: { name: after.name, nameAr: after.nameAr, permissions: after.permissions },
      });
      await enqueueOutbox(tx, ctx, {
        companyId: scope.companyId,
        aggregateType: 'role',
        aggregateId: role.id,
        eventType: 'iam.role.updated',
        payload: { roleId: role.id },
      });
      return toRoleDto(after);
    });
  }

  /** Deletes an unused, non-system role. */
  async deleteRole(scope: CompanyScope, p: Principal, roleId: string, ctx: AuditContext): Promise<void> {
    const role = await this.prisma.role.findUnique({
      where: { companyId_id: { companyId: scope.companyId, id: roleId } },
      include: { _count: { select: { assignments: true } } },
    });
    if (!role) throw notFound('Role');
    if (role.isSystem) throw forbidden('System roles cannot be deleted');
    if (role._count.assignments > 0)
      throw conflict(
        `Role is assigned to ${role._count.assignments} user(s); remove those assignments first`,
      );
    await this.assertCanDelegate(scope.companyId, p, role.permissions, null);
    await this.prisma.$transaction(async (tx) => {
      const deleted = await tx.role.deleteMany({ where: { id: role.id, companyId: scope.companyId } });
      if (deleted.count !== 1) throw notFound('Role');
      await writeAudit(tx, ctx, {
        action: 'iam.role.delete',
        entityType: 'role',
        entityId: role.id,
        companyId: scope.companyId,
        before: { code: role.code, name: role.name, permissions: role.permissions },
      });
    });
  }

  async assign(
    scope: CompanyScope,
    p: Principal,
    input: CreateRoleAssignmentInput,
    ctx: AuditContext,
  ): Promise<RoleAssignmentDto> {
    const branchId = input.branchId ?? null;
    if (!scope.allBranches && (branchId === null || !scope.branchIds.includes(branchId))) {
      throw forbidden('You can only manage assignments for branches in your scope');
    }
    const [user, role, branch] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: input.userId } }),
      this.prisma.role.findUnique({
        where: { companyId_id: { companyId: scope.companyId, id: input.roleId } },
      }),
      branchId
        ? this.prisma.branch.findUnique({
            where: { companyId_id: { companyId: scope.companyId, id: branchId } },
          })
        : null,
    ]);
    if (!user || user.status !== 'active') throw unprocessable('userId is not an active user');
    if (!role) throw unprocessable('roleId is not a role of this company');
    if (branchId && !branch) throw unprocessable('branchId is not a branch of this company');
    await this.assertCanDelegate(scope.companyId, p, role.permissions, branchId);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const a = await tx.roleAssignment.create({
          data: {
            companyId: scope.companyId,
            userId: user.id,
            roleId: role.id,
            branchId,
            grantedBy: p.userId,
          },
        });
        await writeAudit(tx, ctx, {
          action: 'iam.assignment.create',
          entityType: 'role_assignment',
          entityId: a.id,
          companyId: scope.companyId,
          branchId,
          after: { ...a, roleCode: role.code },
        });
        await enqueueOutbox(tx, ctx, {
          companyId: scope.companyId,
          aggregateType: 'user',
          aggregateId: user.id,
          eventType: 'iam.assignment.created',
          payload: { assignmentId: a.id, userId: user.id, roleId: role.id, branchId },
        });
        return toAssignmentDto(a);
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict('This user already has this role for that scope');
      throw err;
    }
  }

  async listAssignments(scope: CompanyScope): Promise<RoleAssignmentDto[]> {
    const rows = await this.prisma.roleAssignment.findMany({
      where: {
        companyId: scope.companyId,
        ...(scope.allBranches ? {} : { branchId: { in: scope.branchIds } }),
      },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toAssignmentDto);
  }

  async revoke(scope: CompanyScope, p: Principal, assignmentId: string, ctx: AuditContext): Promise<void> {
    const a = await this.prisma.roleAssignment.findFirst({
      where: { id: assignmentId, companyId: scope.companyId },
      include: { role: true },
    });
    if (!a || (!scope.allBranches && (a.branchId === null || !scope.branchIds.includes(a.branchId)))) {
      throw notFound('Role assignment');
    }
    // Prevents administrators from locking themselves (and possibly the company) out.
    if (a.userId === p.userId)
      throw unprocessable('You cannot remove your own role assignment; ask another administrator');
    await this.assertCanDelegate(scope.companyId, p, a.role.permissions, a.branchId);
    await this.prisma.$transaction(async (tx) => {
      const deleted = await tx.roleAssignment.deleteMany({ where: { id: a.id, companyId: scope.companyId } });
      if (deleted.count !== 1) throw notFound('Role assignment');
      await writeAudit(tx, ctx, {
        action: 'iam.assignment.revoke',
        entityType: 'role_assignment',
        entityId: a.id,
        companyId: scope.companyId,
        branchId: a.branchId,
        before: { ...a, role: undefined, roleCode: a.role.code },
      });
      await enqueueOutbox(tx, ctx, {
        companyId: scope.companyId,
        aggregateType: 'user',
        aggregateId: a.userId,
        eventType: 'iam.assignment.revoked',
        payload: { assignmentId: a.id, userId: a.userId, roleId: a.roleId, branchId: a.branchId },
      });
    });
  }

  /** Platform administrators may delegate in any company (audited break-glass); others may not escalate. */
  async assertCanDelegate(companyId: string, p: Principal, perms: string[], branchId: string | null) {
    if (p.isPlatformAdmin) return;
    const grants = await this.authz.grants(p.userId, companyId);
    if (!canDelegate(companyId, grants, perms, branchId)) {
      throw forbidden('You cannot grant or revoke permissions beyond your own scope');
    }
  }
}
