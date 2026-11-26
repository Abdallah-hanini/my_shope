import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { GeneralLedgerQuery, TrialBalanceQuery } from '@erp/validation';
import type { CompanyScope } from '../auth/principal';
import { notFound, unprocessable } from '../common/errors';
import { formatMoney } from '../accounting/money';
import { PrismaService } from '../infra/prisma.service';
import { netProfit } from './kpi';
import { buildTrialBalance, decodeCursor, encodeCursor, type TbMovement } from './ledger';
import type { GeneralLedgerDto, LedgerAccountDto, TrialBalanceDto } from './ledger.dto';
import { ledgerBranchFilter } from './report-scope';

const dec = (v: Prisma.Decimal | string | number | null | undefined) => new Prisma.Decimal(v ?? 0);
const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const RR = { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead };

type AccountRow = {
  id: string;
  code: string;
  name: string;
  nameAr: string | null;
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  isPosting: boolean;
  status: string;
};
const accountDto = (a: AccountRow): LedgerAccountDto => ({
  id: a.id,
  code: a.code,
  name: a.name,
  nameAr: a.nameAr,
  type: a.type,
  isPosting: a.isPosting,
  status: a.status,
});

/** WEB-122 trial balance and WEB-100 general ledger, read from reporting.ledger_line. */
@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService) {}

  async trialBalance(scope: CompanyScope, q: TrialBalanceQuery): Promise<TrialBalanceDto> {
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: scope.companyId } });
    const branchFilter = await ledgerBranchFilter(this.prisma, scope, q.branchId);
    type Mv = { account_id: string; opening: Prisma.Decimal; debit: Prisma.Decimal; credit: Prisma.Decimal };
    // One snapshot: accounts and both sums see the same committed journals.
    const [accounts, sums] = await this.prisma.$transaction(
      [
        this.prisma.account.findMany({ where: { companyId: scope.companyId } }),
        this.prisma.$queryRaw<Mv[]>`
          SELECT account_id,
                 coalesce(sum(debit - credit) FILTER (WHERE posting_date < ${q.from}::date), 0) AS opening,
                 coalesce(sum(debit) FILTER (WHERE posting_date >= ${q.from}::date), 0) AS debit,
                 coalesce(sum(credit) FILTER (WHERE posting_date >= ${q.from}::date), 0) AS credit
            FROM reporting.ledger_line
           WHERE company_id = ${scope.companyId}::uuid AND posting_date <= ${q.to}::date ${branchFilter}
           GROUP BY account_id`,
      ],
      RR,
    );
    const movements = new Map<string, TbMovement>(
      sums.map((r) => [
        r.account_id,
        { opening: dec(r.opening), periodDebit: dec(r.debit), periodCredit: dec(r.credit) },
      ]),
    );
    const tb = buildTrialBalance(accounts, movements, q.includeZero);
    const money = (v: Prisma.Decimal) => formatMoney(v, company.baseCurrency);
    const byId = new Map(accounts.map((a) => [a.id, a]));
    return {
      currency: company.baseCurrency,
      from: q.from,
      to: q.to,
      branchId: q.branchId ?? null,
      scope: scope.allBranches ? 'company' : 'branches',
      asOf: new Date().toISOString(),
      rows: tb.rows.map((r) => ({
        account: accountDto(byId.get(r.account.id)!),
        level: r.level,
        opening: money(r.opening),
        periodDebit: money(r.periodDebit),
        periodCredit: money(r.periodCredit),
        closing: money(r.closing),
      })),
      totals: {
        openingDebit: money(tb.totals.openingDebit),
        openingCredit: money(tb.totals.openingCredit),
        periodDebit: money(tb.totals.periodDebit),
        periodCredit: money(tb.totals.periodCredit),
        closingDebit: money(tb.totals.closingDebit),
        closingCredit: money(tb.totals.closingCredit),
      },
      balanced: tb.balanced,
      periodResult: money(netProfit(tb.result)),
    };
  }

  async generalLedger(scope: CompanyScope, q: GeneralLedgerQuery): Promise<GeneralLedgerDto> {
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: scope.companyId } });
    const account = await this.prisma.account.findUnique({
      where: { companyId_id: { companyId: scope.companyId, id: q.accountId } },
    });
    if (!account) throw notFound('Account');
    if (!account.isPosting) {
      throw unprocessable('This is a header account; open one of its posting accounts');
    }
    const cursor = q.cursor === undefined ? undefined : decodeCursor(q.cursor);
    if (cursor === null) throw unprocessable('cursor is not valid; start again from the first page');
    const branchFilter = await ledgerBranchFilter(this.prisma, scope, q.branchId);
    const where = Prisma.sql`company_id = ${scope.companyId}::uuid AND account_id = ${account.id}::uuid ${branchFilter}`;
    const inRange = Prisma.sql`posting_date BETWEEN ${q.from}::date AND ${q.to}::date`;
    const position = Prisma.sql`(posting_date, journal_number, line_no)`;
    const after = cursor
      ? Prisma.sql`AND ${position} > (${cursor.date}::date, ${cursor.number}, ${cursor.lineNo})`
      : Prisma.empty;
    const upTo = cursor
      ? Prisma.sql`${position} <= (${cursor.date}::date, ${cursor.number}, ${cursor.lineNo})`
      : Prisma.sql`false`;

    type Sums = {
      opening: Prisma.Decimal;
      debit: Prisma.Decimal;
      credit: Prisma.Decimal;
      before_page: Prisma.Decimal;
      n: bigint;
    };
    type Line = {
      line_id: string;
      journal_id: string;
      journal_number: string;
      posting_date: Date;
      source_type: string;
      description: string;
      line_no: number;
      debit: Prisma.Decimal;
      credit: Prisma.Decimal;
    };
    const [sumRows, lines] = await this.prisma.$transaction(
      [
        this.prisma.$queryRaw<Sums[]>`
          SELECT coalesce(sum(debit - credit) FILTER (WHERE posting_date < ${q.from}::date), 0) AS opening,
                 coalesce(sum(debit) FILTER (WHERE ${inRange}), 0) AS debit,
                 coalesce(sum(credit) FILTER (WHERE ${inRange}), 0) AS credit,
                 coalesce(sum(debit - credit) FILTER (WHERE ${inRange} AND ${upTo}), 0) AS before_page,
                 count(*) FILTER (WHERE ${inRange}) AS n
            FROM reporting.ledger_line
           WHERE ${where} AND posting_date <= ${q.to}::date`,
        this.prisma.$queryRaw<Line[]>`
          SELECT line_id, journal_id, journal_number, posting_date, source_type::text AS source_type,
                 description, line_no, debit, credit
            FROM reporting.ledger_line
           WHERE ${where} AND ${inRange} ${after}
           ORDER BY posting_date, journal_number, line_no
           LIMIT ${q.limit + 1}`,
      ],
      RR,
    );
    const s = sumRows[0];
    const opening = dec(s?.opening);
    const periodDebit = dec(s?.debit);
    const periodCredit = dec(s?.credit);
    const pageOpening = opening.plus(dec(s?.before_page));
    const page = lines.slice(0, q.limit);
    const money = (v: Prisma.Decimal) => formatMoney(v, company.baseCurrency);
    let running = pageOpening;
    const last = page.at(-1);
    return {
      currency: company.baseCurrency,
      account: accountDto(account),
      from: q.from,
      to: q.to,
      branchId: q.branchId ?? null,
      scope: scope.allBranches ? 'company' : 'branches',
      asOf: new Date().toISOString(),
      opening: money(opening),
      periodDebit: money(periodDebit),
      periodCredit: money(periodCredit),
      closing: money(opening.plus(periodDebit).minus(periodCredit)),
      lineCount: Number(s?.n ?? 0),
      pageOpening: money(pageOpening),
      lines: page.map((l) => {
        running = running.plus(l.debit).minus(l.credit);
        return {
          lineId: l.line_id,
          journalId: l.journal_id,
          journalNumber: l.journal_number,
          postingDate: isoDate(l.posting_date),
          sourceType: l.source_type,
          description: l.description,
          debit: money(dec(l.debit)),
          credit: money(dec(l.credit)),
          balance: money(running),
        };
      }),
      nextCursor:
        lines.length > q.limit && last
          ? encodeCursor({
              date: isoDate(last.posting_date),
              number: last.journal_number,
              lineNo: last.line_no,
            })
          : null,
    };
  }
}
