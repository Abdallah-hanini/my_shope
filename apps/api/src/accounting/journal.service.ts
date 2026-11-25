import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ListQuery, PostJournalInput, ReverseJournalInput } from '@erp/validation';
import { scopeIncludesBranch, type CompanyScope } from '../auth/principal';
import { requestHash } from '../common/canonical-hash';
import { decodeCursor, encodeCursor } from '../common/cursor';
import { fromIsoDate, toIsoDate } from '../common/dates';
import { conflict, forbidden, notFound, unprocessable } from '../common/errors';
import { PrismaService } from '../infra/prisma.service';
import { isUniqueViolation } from '../org/org.service';
import { writeAudit, type AuditContext } from '../platform/audit';
import { enqueueOutbox } from '../platform/outbox';
import { formatDocumentNumber, nextDocumentNumber } from '../platform/sequence';
import type { JournalDto, JournalPageDto } from './accounting.dto';
import { formatMoney, validateLines } from './money';

const journalInclude = {
  lines: { orderBy: { lineNo: 'asc' }, include: { account: { select: { code: true } } } },
  reversedBy: { select: { id: true } },
} satisfies Prisma.JournalInclude;
type JournalWithLines = Prisma.JournalGetPayload<{ include: typeof journalInclude }>;

export interface PostResult {
  journal: JournalDto;
  replayed: boolean;
}

interface NewLine {
  accountId: string;
  debit: string;
  credit: string;
  description: string | null;
}

@Injectable()
export class JournalService {
  constructor(private readonly prisma: PrismaService) {}

  toDto(j: JournalWithLines): JournalDto {
    return {
      id: j.id,
      number: j.number,
      postingDate: toIsoDate(j.postingDate),
      description: j.description,
      branchId: j.branchId,
      fiscalPeriodId: j.fiscalPeriodId,
      currency: j.currency,
      totalDebit: formatMoney(j.totalDebit, j.currency),
      totalCredit: formatMoney(j.totalCredit, j.currency),
      sourceType: j.sourceType,
      reversalOfId: j.reversalOfId,
      reversedById: j.reversedBy[0]?.id ?? null,
      postedBy: j.postedBy,
      postedAt: j.postedAt.toISOString(),
      lines: j.lines.map((l) => ({
        lineNo: l.lineNo,
        accountId: l.accountId,
        accountCode: l.account.code,
        description: l.description,
        debit: formatMoney(l.debit, j.currency),
        credit: formatMoney(l.credit, j.currency),
      })),
    };
  }

  async post(
    scope: CompanyScope,
    input: PostJournalInput,
    idempotencyKey: string,
    ctx: AuditContext & { actorUserId: string },
  ): Promise<PostResult> {
    const branchId = input.branchId ?? null;
    if (!scopeIncludesBranch(scope, branchId)) {
      throw forbidden(
        branchId
          ? 'Branch is outside your posting scope'
          : 'Company-level journals require company-wide posting scope',
      );
    }
    const hash = requestHash({ op: 'post', input });
    const replay = await this.findReplay(scope, idempotencyKey, hash);
    if (replay) return replay;
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: scope.companyId } });
    if (branchId) {
      const b = await this.prisma.branch.findUnique({
        where: { companyId_id: { companyId: scope.companyId, id: branchId } },
      });
      if (!b || b.status !== 'active')
        throw unprocessable('branchId is not an active branch of this company');
    }
    const { total } = validateLines(input.lines, company.baseCurrency);
    await this.assertPostingAccounts(
      scope.companyId,
      input.lines.map((l) => l.accountId),
    );

    return this.write(scope, idempotencyKey, hash, ctx, {
      branchId,
      postingDate: input.postingDate,
      description: input.description,
      currency: company.baseCurrency,
      total,
      sourceType: 'manual',
      sourceId: null,
      reversalOfId: null,
      reason: undefined,
      lines: input.lines.map((l) => ({
        accountId: l.accountId,
        debit: l.debit,
        credit: l.credit,
        description: l.description ?? null,
      })),
    });
  }

  async reverse(
    scope: CompanyScope,
    journalId: string,
    input: ReverseJournalInput,
    idempotencyKey: string,
    ctx: AuditContext & { actorUserId: string },
  ): Promise<PostResult> {
    const hash = requestHash({ op: 'reverse', journalId, input });
    const replay = await this.findReplay(scope, idempotencyKey, hash);
    if (replay) return replay;

    const original = await this.prisma.journal.findUnique({
      where: { companyId_id: { companyId: scope.companyId, id: journalId } },
      include: journalInclude,
    });
    if (!original || !scopeIncludesBranch(scope, original.branchId)) throw notFound('Journal');
    if (original.sourceType === 'reversal')
      throw unprocessable('A reversal cannot itself be reversed; post a new journal');
    if (original.reversedBy.length > 0) throw conflict(`Journal ${original.number} is already reversed`);
    if (input.postingDate < toIsoDate(original.postingDate)) {
      throw unprocessable('Reversal date cannot be earlier than the original posting date');
    }

    return this.write(scope, idempotencyKey, hash, ctx, {
      branchId: original.branchId,
      postingDate: input.postingDate,
      description: `Reversal of ${original.number}: ${input.reason}`.slice(0, 500),
      currency: original.currency,
      total: original.totalDebit,
      sourceType: 'reversal',
      sourceId: original.id,
      reversalOfId: original.id,
      reason: input.reason,
      // Mirror image: debits become credits and vice versa.
      lines: original.lines.map((l) => ({
        accountId: l.accountId,
        debit: l.credit.toString(),
        credit: l.debit.toString(),
        description: l.description,
      })),
    });
  }

  async get(scope: CompanyScope, journalId: string): Promise<JournalDto> {
    const j = await this.prisma.journal.findUnique({
      where: { companyId_id: { companyId: scope.companyId, id: journalId } },
      include: journalInclude,
    });
    if (!j || !scopeIncludesBranch(scope, j.branchId)) throw notFound('Journal');
    return this.toDto(j);
  }

  async list(scope: CompanyScope, q: ListQuery): Promise<JournalPageDto> {
    const cursor = decodeCursor(q.cursor);
    const rows = await this.prisma.journal.findMany({
      where: {
        companyId: scope.companyId,
        ...(scope.allBranches ? {} : { branchId: { in: scope.branchIds } }),
        ...(cursor
          ? {
              OR: [
                { postedAt: { lt: new Date(cursor.at) } },
                { postedAt: new Date(cursor.at), id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ postedAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      include: journalInclude,
    });
    const page = rows.slice(0, q.limit);
    const last = page[page.length - 1];
    return {
      items: page.map((j) => this.toDto(j)),
      nextCursor:
        rows.length > q.limit && last ? encodeCursor({ at: last.postedAt.toISOString(), id: last.id }) : null,
    };
  }

  /** A replay is only served when the stored journal is visible in the caller's own scope. */
  private async findReplay(scope: CompanyScope, key: string, hash: string): Promise<PostResult | null> {
    const existing = await this.prisma.journal.findUnique({
      where: { companyId_idempotencyKey: { companyId: scope.companyId, idempotencyKey: key } },
      include: journalInclude,
    });
    if (!existing) return null;
    if (existing.requestHash !== hash || !scopeIncludesBranch(scope, existing.branchId)) {
      throw conflict('Idempotency-Key was already used with a different request');
    }
    return { journal: this.toDto(existing), replayed: true };
  }

  private async assertPostingAccounts(companyId: string, ids: string[]): Promise<void> {
    const unique = [...new Set(ids)];
    const accounts = await this.prisma.account.findMany({ where: { companyId, id: { in: unique } } });
    if (accounts.length !== unique.length)
      throw unprocessable('One or more accounts do not exist in this company');
    const bad = accounts.filter((a) => !a.isPosting || a.status !== 'active');
    if (bad.length) {
      throw unprocessable(`Accounts ${bad.map((a) => a.code).join(', ')} are header or inactive accounts`);
    }
  }

  private async write(
    scope: CompanyScope,
    idempotencyKey: string,
    hash: string,
    ctx: AuditContext & { actorUserId: string },
    j: {
      branchId: string | null;
      postingDate: string;
      description: string;
      currency: string;
      total: Prisma.Decimal;
      sourceType: 'manual' | 'reversal';
      sourceId: string | null;
      reversalOfId: string | null;
      reason: string | undefined;
      lines: NewLine[];
    },
  ): Promise<PostResult> {
    try {
      const id = await this.prisma.$transaction(
        async (tx) => {
          // FOR SHARE: a concurrent close (FOR UPDATE) waits for this transaction, and vice versa.
          const periods = await tx.$queryRaw<{ id: string; status: string; name: string }[]>`
            SELECT id, status::text AS status, name FROM accounting.fiscal_period
             WHERE company_id = ${scope.companyId}::uuid AND ${j.postingDate}::date BETWEEN start_date AND end_date
             FOR SHARE`;
          const period = periods[0];
          if (!period) throw unprocessable(`No fiscal period contains ${j.postingDate}`);
          if (period.status !== 'open') throw unprocessable(`Fiscal period ${period.name} is closed`);

          const series = j.postingDate.slice(0, 4);
          const seq = await nextDocumentNumber(tx, scope.companyId, 'JV', series);
          const journal = await tx.journal.create({
            data: {
              companyId: scope.companyId,
              branchId: j.branchId,
              fiscalPeriodId: period.id,
              number: formatDocumentNumber('JV', series, seq),
              postingDate: fromIsoDate(j.postingDate),
              description: j.description,
              currency: j.currency,
              totalDebit: j.total,
              totalCredit: j.total,
              sourceType: j.sourceType,
              sourceId: j.sourceId,
              reversalOfId: j.reversalOfId,
              idempotencyKey,
              requestHash: hash,
              postedBy: ctx.actorUserId,
            },
          });
          await tx.journalLine.createMany({
            data: j.lines.map((l, i) => ({
              companyId: scope.companyId,
              journalId: journal.id,
              lineNo: i + 1,
              accountId: l.accountId,
              branchId: j.branchId,
              description: l.description,
              debit: l.debit,
              credit: l.credit,
            })),
          });
          await writeAudit(tx, ctx, {
            action: j.sourceType === 'reversal' ? 'accounting.journal.reverse' : 'accounting.journal.post',
            entityType: 'journal',
            entityId: journal.id,
            companyId: scope.companyId,
            branchId: j.branchId,
            reason: j.reason,
            after: {
              number: journal.number,
              postingDate: j.postingDate,
              total: j.total.toString(),
              reversalOfId: j.reversalOfId,
              lines: j.lines,
            },
          });
          await enqueueOutbox(tx, {
            companyId: scope.companyId,
            aggregateType: 'journal',
            aggregateId: journal.id,
            eventType:
              j.sourceType === 'reversal' ? 'accounting.journal.reversed' : 'accounting.journal.posted',
            payload: { journalId: journal.id, number: journal.number, reversalOfId: j.reversalOfId },
          });
          return journal.id;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 15000, maxWait: 10000 },
      );
      const created = await this.prisma.journal.findUniqueOrThrow({ where: { id }, include: journalInclude });
      return { journal: this.toDto(created), replayed: false };
    } catch (err) {
      if (isUniqueViolation(err)) {
        // Lost a race: same key (replay or 409) or a concurrent reversal of the same journal (409).
        const replay = await this.findReplay(scope, idempotencyKey, hash);
        if (replay) return replay;
        if (j.reversalOfId) throw conflict('Journal is already reversed');
      }
      throw err;
    }
  }
}
