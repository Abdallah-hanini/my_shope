import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { FinancialSummaryQuery } from '@erp/validation';
import type { CompanyScope } from '../auth/principal';
import { forbidden, unprocessable } from '../common/errors';
import { PrismaService } from '../infra/prisma.service';
import { formatMoney } from '../accounting/money';
import type { FinancialSummaryDto } from './reporting.dto';
import {
  grossMarginPercent,
  grossProfit,
  lastDayOfMonth,
  monthRange,
  netProfit,
  type LedgerSums,
} from './kpi';

const ZERO = new Prisma.Decimal(0);
const dec = (v: Prisma.Decimal | string | number | null | undefined) => new Prisma.Decimal(v ?? 0);

@Injectable()
export class ReportingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Executive financial summary from posted journals (reporting.ledger_line). Branch-limited
   * callers only ever see journals of their branches; company-level journals are excluded for them.
   */
  async financialSummary(scope: CompanyScope, q: FinancialSummaryQuery): Promise<FinancialSummaryDto> {
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: scope.companyId } });
    if (q.branchId) {
      const branch = await this.prisma.branch.findUnique({
        where: { companyId_id: { companyId: scope.companyId, id: q.branchId } },
      });
      if (!branch) throw unprocessable('branchId is not a branch of this company');
      if (!scope.allBranches && !scope.branchIds.includes(q.branchId))
        throw forbidden('Branch is outside your reporting scope');
    }
    const fromDate = `${q.from}-01`;
    const toDate = lastDayOfMonth(q.to);
    const branchFilter = q.branchId
      ? Prisma.sql`AND branch_id = ${q.branchId}::uuid`
      : scope.allBranches
        ? Prisma.empty
        : Prisma.sql`AND branch_id = ANY(${scope.branchIds}::uuid[])`;

    const sums = Prisma.sql`
      coalesce(sum(credit - debit) FILTER (WHERE account_type = 'revenue'), 0) AS revenue,
      coalesce(sum(debit - credit) FILTER (WHERE account_type = 'expense' AND reporting_class = 'cogs'), 0) AS cogs,
      coalesce(sum(debit - credit) FILTER (WHERE account_type = 'expense' AND reporting_class IS DISTINCT FROM 'cogs'), 0) AS opex`;
    type SumRow = { revenue: Prisma.Decimal; cogs: Prisma.Decimal; opex: Prisma.Decimal };

    const [totalsRows, monthRows, cashRows, countRows, branchRows, cashConfigured, openPeriods, reversals] =
      await this.prisma.$transaction(
        [
          this.prisma.$queryRaw<SumRow[]>`
            SELECT ${sums} FROM reporting.ledger_line
             WHERE company_id = ${scope.companyId}::uuid AND posting_date BETWEEN ${fromDate}::date AND ${toDate}::date ${branchFilter}`,
          this.prisma.$queryRaw<(SumRow & { month: string })[]>`
            SELECT to_char(posting_date, 'YYYY-MM') AS month, ${sums} FROM reporting.ledger_line
             WHERE company_id = ${scope.companyId}::uuid AND posting_date BETWEEN ${fromDate}::date AND ${toDate}::date ${branchFilter}
             GROUP BY 1`,
          this.prisma.$queryRaw<{ balance: Prisma.Decimal }[]>`
            SELECT coalesce(sum(debit - credit), 0) AS balance FROM reporting.ledger_line
             WHERE company_id = ${scope.companyId}::uuid AND posting_date <= ${toDate}::date
               AND reporting_class IN ('cash', 'bank') ${branchFilter}`,
          this.prisma.$queryRaw<{ n: bigint }[]>`
            SELECT count(DISTINCT journal_id) AS n FROM reporting.ledger_line
             WHERE company_id = ${scope.companyId}::uuid AND posting_date BETWEEN ${fromDate}::date AND ${toDate}::date ${branchFilter}`,
          this.prisma.$queryRaw<
            (SumRow & {
              branch_id: string | null;
              code: string | null;
              name: string | null;
              name_ar: string | null;
            })[]
          >`
            SELECT l.branch_id, b.code, b.name, b.name_ar, ${sums} FROM reporting.ledger_line l
              LEFT JOIN org.branch b ON b.id = l.branch_id AND b.company_id = l.company_id
             WHERE l.company_id = ${scope.companyId}::uuid AND l.posting_date BETWEEN ${fromDate}::date AND ${toDate}::date ${branchFilter}
             GROUP BY l.branch_id, b.code, b.name, b.name_ar
             ORDER BY b.code NULLS FIRST`,
          this.prisma.$queryRaw<{ n: bigint }[]>`
            SELECT count(*) AS n FROM accounting.account
             WHERE company_id = ${scope.companyId}::uuid AND reporting_class IN ('cash', 'bank')`,
          this.prisma.$queryRaw<{ id: string; name: string; end_date: Date }[]>`
            SELECT id, name, end_date FROM accounting.fiscal_period
             WHERE company_id = ${scope.companyId}::uuid AND status = 'open'
               AND end_date < (now() AT TIME ZONE ${company.timezone})::date
             ORDER BY end_date`,
          this.prisma.$queryRaw<{ id: string; number: string; posting_date: Date }[]>`
            SELECT DISTINCT journal_id AS id, journal_number AS number, posting_date FROM reporting.ledger_line
             WHERE company_id = ${scope.companyId}::uuid AND source_type = 'reversal'
               AND posting_date BETWEEN ${fromDate}::date AND ${toDate}::date ${branchFilter}
             ORDER BY posting_date DESC LIMIT 10`,
        ],
        { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
      );

    const money = (v: Prisma.Decimal) => formatMoney(v, company.baseCurrency);
    const toSums = (r?: SumRow): LedgerSums => ({
      revenue: dec(r?.revenue),
      cogs: dec(r?.cogs),
      operatingExpenses: dec(r?.opex),
    });
    const totals = toSums(totalsRows[0]);
    const byMonth = new Map(monthRows.map((r) => [r.month, toSums(r)]));
    const isoDate = (d: Date) => d.toISOString().slice(0, 10);

    return {
      currency: company.baseCurrency,
      from: q.from,
      to: q.to,
      branchId: q.branchId ?? null,
      scope: scope.allBranches ? 'company' : 'branches',
      asOf: new Date().toISOString(),
      totals: {
        revenue: money(totals.revenue),
        cogs: money(totals.cogs),
        grossProfit: money(grossProfit(totals)),
        grossMarginPercent: grossMarginPercent(totals),
        operatingExpenses: money(totals.operatingExpenses),
        netProfit: money(netProfit(totals)),
        cashAndBank: money(dec(cashRows[0]?.balance)),
        journalCount: Number(countRows[0]?.n ?? 0),
      },
      months: monthRange(q.from, q.to).map((month) => {
        const s = byMonth.get(month) ?? { revenue: ZERO, cogs: ZERO, operatingExpenses: ZERO };
        return {
          month,
          revenue: money(s.revenue),
          cogs: money(s.cogs),
          operatingExpenses: money(s.operatingExpenses),
          netProfit: money(netProfit(s)),
        };
      }),
      branches: branchRows.map((r) => {
        const s = toSums(r);
        return {
          branchId: r.branch_id,
          code: r.code,
          name: r.name,
          nameAr: r.name_ar,
          revenue: money(s.revenue),
          expenses: money(s.cogs.plus(s.operatingExpenses)),
          netProfit: money(netProfit(s)),
        };
      }),
      exceptions: [
        ...(Number(cashConfigured[0]?.n ?? 0) === 0
          ? [{ kind: 'no_cash_accounts', recordId: null, label: null, date: null }]
          : []),
        ...openPeriods.map((p) => ({
          kind: 'period_open_after_end',
          recordId: p.id,
          label: p.name,
          date: isoDate(p.end_date),
        })),
        ...reversals.map((r) => ({
          kind: 'reversal_in_range',
          recordId: r.id,
          label: r.number,
          date: isoDate(r.posting_date),
        })),
      ],
    };
  }
}
