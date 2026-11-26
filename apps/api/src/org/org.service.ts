import { Injectable } from '@nestjs/common';
import { Prisma, type Branch, type Company } from '@prisma/client';
import { COMPANY_ADMIN_ROLE, type CreateBranchInput, type CreateCompanyInput } from '@erp/validation';
import type { CompanyScope } from '../auth/principal';
import { conflict, notFound, unprocessable } from '../common/errors';
import { PrismaService } from '../infra/prisma.service';
import { writeAudit, type AuditContext } from '../platform/audit';
import { enqueueOutbox } from '../platform/outbox';
import type { BranchDto, CompanyDto } from './org.dto';

export const toCompanyDto = (c: Company): CompanyDto => ({
  id: c.id,
  code: c.code,
  legalName: c.legalName,
  legalNameAr: c.legalNameAr,
  baseCurrency: c.baseCurrency,
  timezone: c.timezone,
  status: c.status,
  version: c.version,
});

export const toBranchDto = (b: Branch): BranchDto => ({
  id: b.id,
  companyId: b.companyId,
  code: b.code,
  name: b.name,
  nameAr: b.nameAr,
  status: b.status,
  version: b.version,
});

export function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

@Injectable()
export class OrgService {
  constructor(private readonly prisma: PrismaService) {}

  async createCompany(input: CreateCompanyInput, ctx: AuditContext): Promise<CompanyDto> {
    const admin = await this.prisma.user.findUnique({ where: { id: input.initialAdminUserId } });
    if (!admin || admin.status !== 'active') throw unprocessable('initialAdminUserId is not an active user');
    try {
      return await this.prisma.$transaction(async (tx) => {
        const company = await tx.company.create({
          data: {
            code: input.code,
            legalName: input.legalName,
            legalNameAr: input.legalNameAr ?? null,
            baseCurrency: input.baseCurrency,
            timezone: input.timezone,
          },
        });
        const role = await tx.role.create({
          data: {
            companyId: company.id,
            code: COMPANY_ADMIN_ROLE.code,
            name: COMPANY_ADMIN_ROLE.name,
            nameAr: COMPANY_ADMIN_ROLE.nameAr,
            permissions: [...COMPANY_ADMIN_ROLE.permissions],
            isSystem: true,
          },
        });
        const assignment = await tx.roleAssignment.create({
          data: {
            companyId: company.id,
            userId: admin.id,
            roleId: role.id,
            branchId: null,
            grantedBy: ctx.actorUserId,
          },
        });
        await writeAudit(tx, ctx, {
          action: 'org.company.create',
          entityType: 'company',
          entityId: company.id,
          companyId: company.id,
          after: { company, adminRoleId: role.id, adminAssignmentId: assignment.id },
        });
        await enqueueOutbox(tx, ctx, {
          companyId: company.id,
          aggregateType: 'company',
          aggregateId: company.id,
          eventType: 'org.company.created',
          payload: { companyId: company.id, code: company.code },
        });
        return toCompanyDto(company);
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict(`Company code ${input.code} already exists`);
      throw err;
    }
  }

  async listCompaniesFor(userId: string, isPlatformAdmin: boolean): Promise<CompanyDto[]> {
    const rows = await this.prisma.company.findMany({
      where: isPlatformAdmin ? {} : { roleAssignments: { some: { userId } }, status: 'active' },
      orderBy: { code: 'asc' },
    });
    return rows.map(toCompanyDto);
  }

  /**
   * Company header for anyone holding a role in it (every screen needs its name and currency);
   * 404 for everyone else, as for any foreign company.
   */
  async getCompanyForMember(
    userId: string,
    isPlatformAdmin: boolean,
    companyId: string,
  ): Promise<CompanyDto> {
    const c = await this.prisma.company.findFirst({
      where: isPlatformAdmin
        ? { id: companyId }
        : { id: companyId, status: 'active', roleAssignments: { some: { userId } } },
    });
    if (!c) throw notFound('Company');
    return toCompanyDto(c);
  }

  async getCompany(companyId: string): Promise<CompanyDto> {
    const c = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!c) throw notFound('Company');
    return toCompanyDto(c);
  }

  async createBranch(scope: CompanyScope, input: CreateBranchInput, ctx: AuditContext): Promise<BranchDto> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const branch = await tx.branch.create({
          data: {
            companyId: scope.companyId,
            code: input.code,
            name: input.name,
            nameAr: input.nameAr ?? null,
          },
        });
        await writeAudit(tx, ctx, {
          action: 'org.branch.create',
          entityType: 'branch',
          entityId: branch.id,
          companyId: scope.companyId,
          branchId: branch.id,
          after: branch,
        });
        await enqueueOutbox(tx, ctx, {
          companyId: scope.companyId,
          aggregateType: 'branch',
          aggregateId: branch.id,
          eventType: 'org.branch.created',
          payload: { branchId: branch.id, code: branch.code },
        });
        return toBranchDto(branch);
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict(`Branch code ${input.code} already exists in this company`);
      throw err;
    }
  }

  async listBranches(scope: CompanyScope): Promise<BranchDto[]> {
    const rows = await this.prisma.branch.findMany({
      where: { companyId: scope.companyId, ...(scope.allBranches ? {} : { id: { in: scope.branchIds } }) },
      orderBy: { code: 'asc' },
    });
    return rows.map(toBranchDto);
  }
}
