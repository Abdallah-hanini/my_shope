import { Injectable } from '@nestjs/common';
import { Prisma, type Account, type FiscalPeriod } from '@prisma/client';
import type { CloseFiscalPeriodInput, CreateAccountInput, CreateFiscalPeriodInput } from '@erp/validation';
import type { CompanyScope } from '../auth/principal';
import { conflict, notFound, unprocessable } from '../common/errors';
import { fromIsoDate, toIsoDate } from '../common/dates';
import { PrismaService } from '../infra/prisma.service';
import { isUniqueViolation } from '../org/org.service';
import { writeAudit, type AuditContext } from '../platform/audit';
import { enqueueOutbox } from '../platform/outbox';
import type { AccountDto, FiscalPeriodDto } from './accounting.dto';

export const toAccountDto = (a: Account): AccountDto => ({
  id: a.id,
  code: a.code,
  name: a.name,
  nameAr: a.nameAr,
  type: a.type,
  parentId: a.parentId,
  isPosting: a.isPosting,
  reportingClass: a.reportingClass,
  status: a.status,
  version: a.version,
});

export const toPeriodDto = (p: FiscalPeriod): FiscalPeriodDto => ({
  id: p.id,
  name: p.name,
  startDate: toIsoDate(p.startDate),
  endDate: toIsoDate(p.endDate),
  status: p.status,
  closedAt: p.closedAt?.toISOString() ?? null,
  closedBy: p.closedBy,
  version: p.version,
});

@Injectable()
export class AccountingService {
  constructor(private readonly prisma: PrismaService) {}

  async createAccount(
    scope: CompanyScope,
    input: CreateAccountInput,
    ctx: AuditContext,
  ): Promise<AccountDto> {
    if (input.parentId) {
      const parent = await this.prisma.account.findUnique({
        where: { companyId_id: { companyId: scope.companyId, id: input.parentId } },
      });
      if (!parent) throw unprocessable('parentId is not an account of this company');
      if (parent.isPosting) throw unprocessable('parent must be a header (non-posting) account');
      if (parent.type !== input.type)
        throw unprocessable(`parent is a ${parent.type} account; child must match`);
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const a = await tx.account.create({
          data: {
            companyId: scope.companyId,
            code: input.code,
            name: input.name,
            nameAr: input.nameAr ?? null,
            type: input.type,
            parentId: input.parentId ?? null,
            isPosting: input.isPosting,
            reportingClass: input.reportingClass ?? null,
          },
        });
        await writeAudit(tx, ctx, {
          action: 'accounting.account.create',
          entityType: 'account',
          entityId: a.id,
          companyId: scope.companyId,
          after: a,
        });
        await enqueueOutbox(tx, {
          companyId: scope.companyId,
          aggregateType: 'account',
          aggregateId: a.id,
          eventType: 'accounting.account.created',
          payload: { accountId: a.id, code: a.code, type: a.type },
        });
        return toAccountDto(a);
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict(`Account code ${input.code} already exists`);
      throw err;
    }
  }

  async listAccounts(scope: CompanyScope): Promise<AccountDto[]> {
    const rows = await this.prisma.account.findMany({
      where: { companyId: scope.companyId },
      orderBy: { code: 'asc' },
    });
    return rows.map(toAccountDto);
  }

  async createPeriod(
    scope: CompanyScope,
    input: CreateFiscalPeriodInput,
    ctx: AuditContext,
  ): Promise<FiscalPeriodDto> {
    const start = fromIsoDate(input.startDate);
    const end = fromIsoDate(input.endDate);
    const overlapping = await this.prisma.fiscalPeriod.findFirst({
      where: { companyId: scope.companyId, startDate: { lte: end }, endDate: { gte: start } },
    });
    if (overlapping) throw conflict(`Overlaps fiscal period ${overlapping.name}`);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const p = await tx.fiscalPeriod.create({
          data: { companyId: scope.companyId, name: input.name, startDate: start, endDate: end },
        });
        await writeAudit(tx, ctx, {
          action: 'accounting.period.create',
          entityType: 'fiscal_period',
          entityId: p.id,
          companyId: scope.companyId,
          after: toPeriodDto(p),
        });
        return toPeriodDto(p);
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict(`Fiscal period ${input.name} already exists`);
      if (isExclusionViolation(err)) throw conflict('Overlaps an existing fiscal period');
      throw err;
    }
  }

  async listPeriods(scope: CompanyScope): Promise<FiscalPeriodDto[]> {
    const rows = await this.prisma.fiscalPeriod.findMany({
      where: { companyId: scope.companyId },
      orderBy: { startDate: 'asc' },
    });
    return rows.map(toPeriodDto);
  }

  /**
   * Closes a period. FOR UPDATE waits for in-flight postings (which hold FOR SHARE on the period),
   * so nothing can be posted into it after the close commits.
   */
  async closePeriod(
    scope: CompanyScope,
    periodId: string,
    input: CloseFiscalPeriodInput,
    ctx: AuditContext & { actorUserId: string },
  ): Promise<FiscalPeriodDto> {
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM accounting.fiscal_period
         WHERE company_id = ${scope.companyId}::uuid AND id = ${periodId}::uuid
         FOR UPDATE`;
      if (locked.length === 0) throw notFound('Fiscal period');
      const before = await tx.fiscalPeriod.findUniqueOrThrow({ where: { id: periodId } });
      if (before.status === 'closed') throw conflict('Fiscal period is already closed');
      if (before.version !== input.version) {
        throw conflict(`Fiscal period changed (version ${before.version}); reload and retry`);
      }
      const after = await tx.fiscalPeriod.update({
        where: { id: periodId },
        data: {
          status: 'closed',
          closedAt: new Date(),
          closedBy: ctx.actorUserId,
          version: { increment: 1 },
        },
      });
      await writeAudit(tx, ctx, {
        action: 'accounting.period.close',
        entityType: 'fiscal_period',
        entityId: periodId,
        companyId: scope.companyId,
        reason: input.reason,
        before: toPeriodDto(before),
        after: toPeriodDto(after),
      });
      await enqueueOutbox(tx, {
        companyId: scope.companyId,
        aggregateType: 'fiscal_period',
        aggregateId: periodId,
        eventType: 'accounting.period.closed',
        payload: { periodId, name: after.name },
      });
      return toPeriodDto(after);
    });
  }
}

export function isExclusionViolation(err: unknown): boolean {
  return (
    (err instanceof Prisma.PrismaClientKnownRequestError ||
      err instanceof Prisma.PrismaClientUnknownRequestError) &&
    /23P01|exclusion constraint/i.test(err.message)
  );
}
