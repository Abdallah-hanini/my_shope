import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AsOfQuery, ProfitAndLossQuery, RangeQuery } from '@erp/validation';
import type { CompanyScope } from '../auth/principal';
import { forbidden, unprocessable } from '../common/errors';
import { PrismaService } from '../infra/prisma.service';
import {
  changePercent,
  daysBetween,
  PAYABLE_BUCKETS,
  payableBucket,
  previousPeriod,
  RECEIVABLE_BUCKETS,
  receivableBucket,
  zeroBuckets,
} from './aging';
import { grossMarginPercent, grossProfit, netProfit } from './kpi';
import { ledgerBranchFilter } from './report-scope';
import type {
  CashFlowDto,
  TaxSummaryDto,
  AgingDto,
  BalanceSheetDto,
  ProfitAndLossDto,
  StatementLineDto,
  StatementSectionDto,
} from './statements.dto';

type Dec = Prisma.Decimal;
const D = Prisma.Decimal;
const money = (d: Dec) => d.toFixed(2);
type AccountSum = {
  account_id: string;
  code: string;
  name: string;
  name_ar: string | null;
  type: string;
  reporting_class: string | null;
  debit: Dec;
  credit: Dec;
};

/**
 * Financial statements and aging (RPT, docs/REPORTING_PLAN.md). Everything is read from posted
 * journals (reporting.ledger_line) or from posted documents filtered by the posting dates of
 * their journals, in one repeatable-read snapshot, so a statement never mixes two moments.
 * Branch-limited readers only see their branches. Each report states how it reconciles.
 */
@Injectable()
export class StatementsService {
  constructor(private readonly prisma: PrismaService) {}

  private async sums(
    tx: Prisma.TransactionClient,
    companyId: string,
    branchFilter: Prisma.Sql,
    from: string | null,
    to: string,
  ) {
    return tx.$queryRaw<AccountSum[]>`
      SELECT l.account_id, a.code, a.name, a.name_ar, a.type::text AS type, a.reporting_class::text AS reporting_class,
             coalesce(sum(l.debit), 0) AS debit, coalesce(sum(l.credit), 0) AS credit
        FROM reporting.ledger_line l
        JOIN accounting.account a ON a.id = l.account_id AND a.company_id = l.company_id
       WHERE l.company_id = ${companyId}::uuid
         AND l.posting_date <= ${to}::date
         ${from ? Prisma.sql`AND l.posting_date >= ${from}::date` : Prisma.empty}
         ${branchFilter}
       GROUP BY l.account_id, a.code, a.name, a.name_ar, a.type, a.reporting_class
       ORDER BY a.code`;
  }

  private section(
    key: string,
    rows: AccountSum[],
    sign: (r: AccountSum) => Dec,
    compare?: Map<string, Dec>,
  ): StatementSectionDto {
    const lines: StatementLineDto[] = rows.map((r) => {
      const amount = sign(r);
      const prev = compare ? (compare.get(r.account_id) ?? new D(0)) : null;
      return {
        accountId: r.account_id,
        code: r.code,
        name: r.name,
        nameAr: r.name_ar,
        amount: money(amount),
        previous: prev ? money(prev) : null,
        changePct: prev ? changePercent(amount, prev) : null,
      };
    });
    const total = rows.reduce((s, r) => s.plus(sign(r)), new D(0));
    const previousTotal = compare ? [...compare.values()].reduce((s, v) => s.plus(v), new D(0)) : null;
    return {
      key,
      lines: lines.filter((l) => l.amount !== '0.00' || (l.previous && l.previous !== '0.00')),
      total: money(total),
      previousTotal: previousTotal ? money(previousTotal) : null,
    };
  }

  async profitAndLoss(scope: CompanyScope, q: ProfitAndLossQuery): Promise<ProfitAndLossDto> {
    const filter = await ledgerBranchFilter(this.prisma, scope, q.branchId, Prisma.raw('l.branch_id'));
    const prev = q.compare === 'previous' ? previousPeriod(q.from, q.to) : null;
    const asOf = new Date();
    const [cur, before] = await this.prisma.$transaction(
      async (tx) => [
        await this.sums(tx, scope.companyId, filter, q.from, q.to),
        prev ? await this.sums(tx, scope.companyId, filter, prev.from, prev.to) : [],
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    const rev = (r: AccountSum) => new D(r.credit).minus(r.debit);
    const exp = (r: AccountSum) => new D(r.debit).minus(r.credit);
    const isCogs = (r: AccountSum) => r.type === 'expense' && r.reporting_class === 'cogs';
    const isOpex = (r: AccountSum) => r.type === 'expense' && r.reporting_class !== 'cogs';
    const prevMap = (pick: (r: AccountSum) => boolean, sign: (r: AccountSum) => Dec) =>
      prev ? new Map(before.filter(pick).map((r) => [r.account_id, sign(r)])) : undefined;
    // Accounts that only moved in the comparison period still appear (with 0.00 now).
    const withPrev = (pick: (r: AccountSum) => boolean) => {
      const rows = cur.filter(pick);
      for (const b of before.filter(pick))
        if (!rows.some((r) => r.account_id === b.account_id))
          rows.push({ ...b, debit: new D(0), credit: new D(0) });
      return rows.sort((x, y) => x.code.localeCompare(y.code));
    };
    const totals = (rows: AccountSum[]) => ({
      revenue: rows.filter((r) => r.type === 'revenue').reduce((s, r) => s.plus(rev(r)), new D(0)),
      cogs: rows.filter(isCogs).reduce((s, r) => s.plus(exp(r)), new D(0)),
      operatingExpenses: rows.filter(isOpex).reduce((s, r) => s.plus(exp(r)), new D(0)),
    });
    const t = totals(cur);
    const p = prev ? totals(before) : null;
    const figure = (now: Dec, then: Dec | null) => ({
      amount: money(now),
      previous: then ? money(then) : null,
      changePct: then ? changePercent(now, then) : null,
    });
    return {
      from: q.from,
      to: q.to,
      previousFrom: prev?.from ?? null,
      previousTo: prev?.to ?? null,
      branchId: q.branchId ?? null,
      currency: (await this.company(scope.companyId)).baseCurrency,
      revenue: this.section(
        'revenue',
        withPrev((r) => r.type === 'revenue'),
        rev,
        prevMap((r) => r.type === 'revenue', rev),
      ),
      costOfSales: this.section('cogs', withPrev(isCogs), exp, prevMap(isCogs, exp)),
      operatingExpenses: this.section('opex', withPrev(isOpex), exp, prevMap(isOpex, exp)),
      grossProfit: figure(grossProfit(t), p ? grossProfit(p) : null),
      netProfit: figure(netProfit(t), p ? netProfit(p) : null),
      grossMarginPct: grossMarginPercent(t),
      previousGrossMarginPct: p ? grossMarginPercent(p) : null,
      asOf: asOf.toISOString(),
    };
  }

  async balanceSheet(scope: CompanyScope, q: AsOfQuery): Promise<BalanceSheetDto> {
    const filter = await ledgerBranchFilter(this.prisma, scope, q.branchId, Prisma.raw('l.branch_id'));
    const asOf = new Date();
    const rows = await this.prisma.$transaction(
      async (tx) => this.sums(tx, scope.companyId, filter, null, q.asOf),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    const dr = (r: AccountSum) => new D(r.debit).minus(r.credit);
    const cr = (r: AccountSum) => new D(r.credit).minus(r.debit);
    const assets = this.section(
      'assets',
      rows.filter((r) => r.type === 'asset'),
      dr,
    );
    const liabilities = this.section(
      'liabilities',
      rows.filter((r) => r.type === 'liability'),
      cr,
    );
    const equity = this.section(
      'equity',
      rows.filter((r) => r.type === 'equity'),
      cr,
    );
    // No year-end close yet: income and expenses since the first entry are the unclosed result.
    const result = rows
      .filter((r) => r.type === 'revenue' || r.type === 'expense')
      .reduce((s, r) => s.plus(cr(r)), new D(0));
    const totalEquity = new D(equity.total).plus(result);
    const lhs = new D(assets.total);
    const rhs = new D(liabilities.total).plus(totalEquity);
    return {
      asOfDate: q.asOf,
      branchId: q.branchId ?? null,
      currency: (await this.company(scope.companyId)).baseCurrency,
      assets,
      liabilities,
      equity,
      unclosedResult: money(result),
      totalEquity: money(totalEquity),
      totalLiabilitiesAndEquity: money(rhs),
      balanced: lhs.equals(rhs),
      difference: money(lhs.minus(rhs)),
      asOf: asOf.toISOString(),
    };
  }

  private async company(companyId: string) {
    return this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
  }

  private async documentBranchFilter(scope: CompanyScope, branchId: string | undefined, column: Prisma.Sql) {
    if (branchId) {
      const b = await this.prisma.branch.findUnique({
        where: { companyId_id: { companyId: scope.companyId, id: branchId } },
      });
      if (!b) throw unprocessable('branchId is not a branch of this company');
      if (!scope.allBranches && !scope.branchIds.includes(branchId))
        throw forbidden('Branch is outside your reporting scope');
      return Prisma.sql`AND ${column} = ${branchId}::uuid`;
    }
    return scope.allBranches ? Prisma.empty : Prisma.sql`AND ${column} = ANY(${scope.branchIds}::uuid[])`;
  }

  /** Ledger balance (debit − credit) of a posting account up to a date, in the same branch scope. */
  private async accountBalance(
    tx: Prisma.TransactionClient,
    companyId: string,
    accountId: string | null | undefined,
    asOf: string,
    filter: Prisma.Sql,
  ): Promise<Dec | null> {
    if (!accountId) return null;
    const [r] = await tx.$queryRaw<{ bal: Dec }[]>`
      SELECT coalesce(sum(l.debit - l.credit), 0) AS bal FROM reporting.ledger_line l
       WHERE l.company_id = ${companyId}::uuid AND l.account_id = ${accountId}::uuid
         AND l.posting_date <= ${asOf}::date ${filter}`;
    return new D(r!.bal);
  }

  /**
   * Customer receivables at a cut-off: invoices posted by then, less payments posted by then,
   * excluding invoices cancelled by a credit note posted by then; aged from the invoice date.
   */
  async receivablesAging(scope: CompanyScope, q: AsOfQuery): Promise<AgingDto> {
    const docFilter = await this.documentBranchFilter(scope, q.branchId, Prisma.raw('i.branch_id'));
    const ledgerFilter = await ledgerBranchFilter(this.prisma, scope, q.branchId, Prisma.raw('l.branch_id'));
    const asOf = new Date();
    const data = await this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<
          {
            id: string;
            number: string;
            party_id: string;
            party: string;
            doc_date: Date;
            due: Date | null;
            total: Dec;
            paid: Dec;
          }[]
        >`
          SELECT i.id, i.number, i.customer_id AS party_id, i.customer_name AS party, i.invoice_date AS doc_date, NULL::date AS due,
                 i.total,
                 coalesce((SELECT sum(p.amount) FROM workshop.payment p JOIN accounting.journal pj ON pj.id = p.journal_id
                            WHERE p.invoice_id = i.id AND pj.posting_date <= ${q.asOf}::date), 0) AS paid
            FROM workshop.invoice i
            JOIN accounting.journal j ON j.id = i.journal_id
           WHERE i.company_id = ${scope.companyId}::uuid AND i.kind = 'invoice'
             AND j.posting_date <= ${q.asOf}::date
             AND NOT EXISTS (SELECT 1 FROM workshop.invoice c JOIN accounting.journal cj ON cj.id = c.journal_id
                              WHERE c.credit_of_id = i.id AND cj.posting_date <= ${q.asOf}::date)
             ${docFilter}
           ORDER BY i.invoice_date, i.number`;
        const settings = await tx.postingSettings.findUnique({ where: { companyId: scope.companyId } });
        const ledger = await this.accountBalance(
          tx,
          scope.companyId,
          settings?.receivableAccountId,
          q.asOf,
          ledgerFilter,
        );
        return { rows, ledger };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return this.aging(
      scope,
      q,
      'receivable',
      data.rows.map((r) => {
        const date = r.doc_date.toISOString().slice(0, 10);
        return {
          ...r,
          date,
          dueDate: null,
          balance: new D(r.total).minus(r.paid),
          bucket: receivableBucket(daysBetween(date, q.asOf)),
        };
      }),
      RECEIVABLE_BUCKETS,
      data.ledger,
      asOf,
    );
  }

  /**
   * Supplier payables at a cut-off: bills posted by then, less supplier payments posted by then,
   * excluding bills cancelled by then; aged by days past the due date.
   */
  async payablesAging(scope: CompanyScope, q: AsOfQuery): Promise<AgingDto> {
    const docFilter = await this.documentBranchFilter(scope, q.branchId, Prisma.raw('b.branch_id'));
    const ledgerFilter = await ledgerBranchFilter(this.prisma, scope, q.branchId, Prisma.raw('l.branch_id'));
    const asOf = new Date();
    const data = await this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<
          {
            id: string;
            number: string;
            party_id: string;
            party: string;
            doc_date: Date;
            due: Date;
            total: Dec;
            paid: Dec;
          }[]
        >`
          SELECT b.id, b.number, b.supplier_id AS party_id, s.name AS party, b.bill_date AS doc_date, b.due_date AS due,
                 b.total,
                 coalesce((SELECT sum(p.amount) FROM purchasing.supplier_payment p JOIN accounting.journal pj ON pj.id = p.journal_id
                            WHERE p.bill_id = b.id AND pj.posting_date <= ${q.asOf}::date), 0) AS paid
            FROM purchasing.supplier_bill b
            JOIN purchasing.supplier s ON s.id = b.supplier_id
            JOIN accounting.journal j ON j.id = b.journal_id
           WHERE b.company_id = ${scope.companyId}::uuid
             AND j.posting_date <= ${q.asOf}::date
             AND NOT (b.cancelled AND EXISTS (SELECT 1 FROM accounting.journal cj
                                                WHERE cj.id = b.cancel_journal_id AND cj.posting_date <= ${q.asOf}::date))
             ${docFilter}
           ORDER BY b.due_date, b.number`;
        const settings = await tx.postingSettings.findUnique({ where: { companyId: scope.companyId } });
        const raw = await this.accountBalance(
          tx,
          scope.companyId,
          settings?.payablesAccountId,
          q.asOf,
          ledgerFilter,
        );
        return { rows, ledger: raw ? raw.negated() : null }; // a liability: credit balance
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return this.aging(
      scope,
      q,
      'payable',
      data.rows.map((r) => {
        const due = r.due.toISOString().slice(0, 10);
        return {
          ...r,
          date: r.doc_date.toISOString().slice(0, 10),
          dueDate: due,
          balance: new D(r.total).minus(r.paid),
          bucket: payableBucket(daysBetween(due, q.asOf)),
        };
      }),
      PAYABLE_BUCKETS,
      data.ledger,
      asOf,
    );
  }

  private async aging<B extends string>(
    scope: CompanyScope,
    q: AsOfQuery,
    kind: 'receivable' | 'payable',
    docs: {
      id: string;
      number: string;
      party_id: string;
      party: string;
      date: string;
      dueDate: string | null;
      total: Dec;
      balance: Dec;
      bucket: B;
    }[],
    keys: readonly B[],
    ledger: Dec | null,
    asOf: Date,
  ): Promise<AgingDto> {
    const open = docs.filter((d) => d.balance.greaterThan(0));
    const parties = new Map<string, { name: string; buckets: Record<B, Dec>; total: Dec; count: number }>();
    const totals = zeroBuckets(keys);
    for (const d of open) {
      const p = parties.get(d.party_id) ?? {
        name: d.party,
        buckets: zeroBuckets(keys),
        total: new D(0),
        count: 0,
      };
      p.buckets[d.bucket] = p.buckets[d.bucket].plus(d.balance);
      p.total = p.total.plus(d.balance);
      p.count++;
      parties.set(d.party_id, p);
      totals[d.bucket] = totals[d.bucket].plus(d.balance);
    }
    const total = open.reduce((s, d) => s.plus(d.balance), new D(0));
    const fmt = (b: Record<B, Dec>) =>
      Object.fromEntries(keys.map((k) => [k, money(b[k])])) as Record<string, string>;
    return {
      kind,
      asOfDate: q.asOf,
      branchId: q.branchId ?? null,
      currency: (await this.company(scope.companyId)).baseCurrency,
      buckets: [...keys],
      totals: fmt(totals),
      total: money(total),
      parties: [...parties.entries()]
        .map(([id, p]) => ({
          id,
          name: p.name,
          documents: p.count,
          buckets: fmt(p.buckets),
          total: money(p.total),
        }))
        .sort((a, b) => new D(b.total).comparedTo(new D(a.total)) || a.name.localeCompare(b.name)),
      documents: open.slice(0, 500).map((d) => ({
        id: d.id,
        number: d.number,
        partyId: d.party_id,
        partyName: d.party,
        date: d.date,
        dueDate: d.dueDate,
        total: money(new D(d.total)),
        balance: money(d.balance),
        bucket: d.bucket,
        days: d.dueDate ? daysBetween(d.dueDate, q.asOf) : daysBetween(d.date, q.asOf),
      })),
      ledgerBalance: ledger ? money(ledger) : null,
      reconciled: ledger ? ledger.equals(total) : false,
      asOf: asOf.toISOString(),
    };
  }

  /**
   * Cash flow (direct method) from the ledger: movements on accounts classed cash or bank. Each
   * journal's net effect on cash is grouped by the journal's source (customer payments, supplier
   * payments, manual journals, reversals, other); journals that only move money between cash
   * accounts net to zero and are counted as internal transfers. Opening + net = closing.
   */
  async cashFlow(scope: CompanyScope, q: RangeQuery): Promise<CashFlowDto> {
    const filter = await ledgerBranchFilter(this.prisma, scope, q.branchId, Prisma.raw('l.branch_id'));
    const cashLine = Prisma.sql`l.company_id = ${scope.companyId}::uuid AND l.reporting_class IN ('cash', 'bank') ${filter}`;
    const data = await this.prisma.$transaction(
      async (tx) => {
        const [bal] = await tx.$queryRaw<{ accounts: bigint; opening: Dec; closing: Dec }[]>`
          SELECT (SELECT count(*) FROM accounting.account a
                   WHERE a.company_id = ${scope.companyId}::uuid AND a.reporting_class IN ('cash', 'bank')) AS accounts,
                 coalesce(sum(l.debit - l.credit) FILTER (WHERE l.posting_date < ${q.from}::date), 0) AS opening,
                 coalesce(sum(l.debit - l.credit) FILTER (WHERE l.posting_date <= ${q.to}::date), 0) AS closing
            FROM reporting.ledger_line l WHERE ${cashLine}`;
        const journals = await tx.$queryRaw<{ source: string; net: Dec }[]>`
          SELECT l.source_type::text AS source, sum(l.debit - l.credit) AS net
            FROM reporting.ledger_line l
           WHERE ${cashLine} AND l.posting_date BETWEEN ${q.from}::date AND ${q.to}::date
           GROUP BY l.journal_id, l.source_type`;
        return { bal: bal!, journals };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    const KEYS = ['customer_receipts', 'supplier_payments', 'manual', 'reversals', 'other'] as const;
    const keyOf = (src: string) =>
      src === 'payment'
        ? 'customer_receipts'
        : src === 'supplier_payment'
          ? 'supplier_payments'
          : src === 'manual'
            ? 'manual'
            : src === 'reversal'
              ? 'reversals'
              : 'other';
    const cats = new Map<string, { inflow: Dec; outflow: Dec; journals: number }>(
      KEYS.map((k) => [k, { inflow: new D(0), outflow: new D(0), journals: 0 }]),
    );
    let internal = 0;
    for (const j of data.journals) {
      const net = new D(j.net);
      if (net.isZero()) {
        internal++;
        continue;
      }
      const c = cats.get(keyOf(j.source))!;
      if (net.greaterThan(0)) c.inflow = c.inflow.plus(net);
      else c.outflow = c.outflow.plus(net.negated());
      c.journals++;
    }
    const inflow = [...cats.values()].reduce((s, c) => s.plus(c.inflow), new D(0));
    const outflow = [...cats.values()].reduce((s, c) => s.plus(c.outflow), new D(0));
    const opening = new D(data.bal.opening);
    const closing = new D(data.bal.closing);
    return {
      from: q.from,
      to: q.to,
      branchId: q.branchId ?? null,
      currency: (await this.company(scope.companyId)).baseCurrency,
      configured: Number(data.bal.accounts) > 0,
      opening: money(opening),
      categories: KEYS.map((k) => {
        const c = cats.get(k)!;
        return {
          key: k,
          inflow: money(c.inflow),
          outflow: money(c.outflow),
          net: money(c.inflow.minus(c.outflow)),
          journals: c.journals,
        };
      }),
      internalTransfers: internal,
      inflow: money(inflow),
      outflow: money(outflow),
      net: money(inflow.minus(outflow)),
      closing: money(closing),
      reconciled: opening.plus(inflow).minus(outflow).equals(closing),
      asOf: new Date().toISOString(),
    };
  }

  /**
   * Tax summary by tax code: output tax on invoices and credit notes posted in the period, input
   * tax on supplier bills posted in the period less bills cancelled in it. Each side is checked
   * against its ledger accounts (the tax codes' payable accounts; the input tax account).
   */
  async taxSummary(scope: CompanyScope, q: RangeQuery): Promise<TaxSummaryDto> {
    const invFilter = await this.documentBranchFilter(scope, q.branchId, Prisma.raw('i.branch_id'));
    const billFilter = await this.documentBranchFilter(scope, q.branchId, Prisma.raw('b.branch_id'));
    const lf = await ledgerBranchFilter(this.prisma, scope, q.branchId, Prisma.raw('l.branch_id'));
    const data = await this.prisma.$transaction(
      async (tx) => {
        const output = await tx.$queryRaw<{ code: string | null; docs: bigint; taxable: Dec; tax: Dec }[]>`
          SELECT i.tax_code AS code, count(*) AS docs,
                 coalesce(sum(CASE WHEN i.kind = 'credit_note' THEN -1 ELSE 1 END * (i.total - i.tax_amount)), 0) AS taxable,
                 coalesce(sum(CASE WHEN i.kind = 'credit_note' THEN -1 ELSE 1 END * i.tax_amount), 0) AS tax
            FROM workshop.invoice i JOIN accounting.journal j ON j.id = i.journal_id
           WHERE i.company_id = ${scope.companyId}::uuid AND j.posting_date BETWEEN ${q.from}::date AND ${q.to}::date ${invFilter}
           GROUP BY i.tax_code ORDER BY i.tax_code NULLS FIRST`;
        const input = await tx.$queryRaw<{ code: string | null; docs: bigint; taxable: Dec; tax: Dec }[]>`
          WITH x AS (
            SELECT b.tax_code, b.net_amount, b.tax_amount, 1 AS sign FROM purchasing.supplier_bill b
              JOIN accounting.journal j ON j.id = b.journal_id
             WHERE b.company_id = ${scope.companyId}::uuid AND j.posting_date BETWEEN ${q.from}::date AND ${q.to}::date ${billFilter}
            UNION ALL
            SELECT b.tax_code, b.net_amount, b.tax_amount, -1 FROM purchasing.supplier_bill b
              JOIN accounting.journal j ON j.id = b.cancel_journal_id
             WHERE b.company_id = ${scope.companyId}::uuid AND j.posting_date BETWEEN ${q.from}::date AND ${q.to}::date ${billFilter})
          SELECT tax_code AS code, count(*) AS docs, coalesce(sum(sign * net_amount), 0) AS taxable, coalesce(sum(sign * tax_amount), 0) AS tax
            FROM x GROUP BY tax_code ORDER BY tax_code NULLS FIRST`;
        const outAccounts = (
          await tx.taxCode.findMany({
            where: { companyId: scope.companyId, outputAccountId: { not: null } },
            select: { outputAccountId: true },
          })
        ).map((c) => c.outputAccountId!);
        const settings = await tx.postingSettings.findUnique({ where: { companyId: scope.companyId } });
        const ledger = async (ids: string[], sign: 'cr' | 'dr') => {
          if (!ids.length) return null;
          const [r] = await tx.$queryRaw<{ v: Dec }[]>`
            SELECT coalesce(sum(${sign === 'cr' ? Prisma.sql`l.credit - l.debit` : Prisma.sql`l.debit - l.credit`}), 0) AS v
              FROM reporting.ledger_line l
             WHERE l.company_id = ${scope.companyId}::uuid AND l.account_id = ANY(${[...new Set(ids)]}::uuid[])
               AND l.posting_date BETWEEN ${q.from}::date AND ${q.to}::date ${lf}`;
          return new D(r!.v);
        };
        return {
          output,
          input,
          outputLedger: await ledger(outAccounts, 'cr'),
          inputLedger: await ledger(settings?.inputTaxAccountId ? [settings.inputTaxAccountId] : [], 'dr'),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    const rows = (r: { code: string | null; docs: bigint; taxable: Dec; tax: Dec }[]) =>
      r.map((x) => ({
        taxCode: x.code,
        documents: Number(x.docs),
        taxable: money(x.taxable),
        tax: money(x.tax),
      }));
    const sum = (r: { tax: Dec }[]) => r.reduce((s, x) => s.plus(x.tax), new D(0));
    const outputTax = sum(data.output);
    const inputTax = sum(data.input);
    return {
      from: q.from,
      to: q.to,
      branchId: q.branchId ?? null,
      currency: (await this.company(scope.companyId)).baseCurrency,
      output: rows(data.output),
      input: rows(data.input),
      outputTax: money(outputTax),
      inputTax: money(inputTax),
      netTax: money(outputTax.minus(inputTax)),
      outputLedger: data.outputLedger ? money(data.outputLedger) : null,
      inputLedger: data.inputLedger ? money(data.inputLedger) : null,
      outputReconciled: data.outputLedger ? data.outputLedger.equals(outputTax) : outputTax.isZero(),
      inputReconciled: data.inputLedger ? data.inputLedger.equals(inputTax) : inputTax.isZero(),
      asOf: new Date().toISOString(),
    };
  }
}
