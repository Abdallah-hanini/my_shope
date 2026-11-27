import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { RangeQuery } from '@erp/validation';
import type { CompanyScope } from '../auth/principal';
import { forbidden, unprocessable } from '../common/errors';
import { PrismaService } from '../infra/prisma.service';
import { ledgerBranchFilter } from './report-scope';
import type {
  CustomersReportDto,
  OperationsReportDto,
  SalesReportDto,
  StockMovementReportDto,
} from './analytics.dto';

type Dec = Prisma.Decimal;
const D = Prisma.Decimal;
const money = (d: Dec | string | number) => new D(d).toFixed(2);
const RR = { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead };

/** Ratio as a percentage with one decimal (half up); null when the denominator is zero. */
export function percent(part: Dec | number, whole: Dec | number): string | null {
  const w = new D(whole);
  if (w.isZero()) return null;
  return new D(part).dividedBy(w).times(100).toDecimalPlaces(1, D.ROUND_HALF_UP).toFixed(1);
}

/**
 * Fast / slow / dead stock classes (docs/KPI_DICTIONARY.md): parts issued in the period are "fast"
 * while their cumulative share of issued value (largest first) stays within 80 % (the part that
 * crosses 80 % is still fast); other issued parts are "slow"; parts with stock but no issue in the
 * period are "dead"; the rest "none".
 */
export function classifyStock(
  rows: { key: string; issuedValue: Dec; closingQty: Dec }[],
): Map<string, 'fast' | 'slow' | 'dead' | 'none'> {
  const out = new Map<string, 'fast' | 'slow' | 'dead' | 'none'>();
  const issued = rows
    .filter((r) => r.issuedValue.greaterThan(0))
    .sort((a, b) => b.issuedValue.comparedTo(a.issuedValue));
  const total = issued.reduce((s, r) => s.plus(r.issuedValue), new D(0));
  let cum = new D(0);
  for (const r of issued) {
    const before = cum;
    cum = cum.plus(r.issuedValue);
    out.set(r.key, before.lessThan(total.times(0.8)) ? 'fast' : 'slow');
  }
  for (const r of rows) if (!out.has(r.key)) out.set(r.key, r.closingQty.greaterThan(0) ? 'dead' : 'none');
  return out;
}

/**
 * Sales, operations, customer and stock-movement analytics (RPT R2, docs/REPORTING_PLAN.md).
 * Financial figures come from posted documents and their own journals; operational figures from
 * job cards in the company's time zone. One repeatable-read snapshot per report; branch scope on
 * the server.
 */
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  private async docFilter(scope: CompanyScope, branchId: string | undefined, column: string) {
    const col = Prisma.raw(column);
    if (branchId) {
      const b = await this.prisma.branch.findUnique({
        where: { companyId_id: { companyId: scope.companyId, id: branchId } },
      });
      if (!b) throw unprocessable('branchId is not a branch of this company');
      if (!scope.allBranches && !scope.branchIds.includes(branchId))
        throw forbidden('Branch is outside your reporting scope');
      return Prisma.sql`AND ${col} = ${branchId}::uuid`;
    }
    return scope.allBranches ? Prisma.empty : Prisma.sql`AND ${col} = ANY(${scope.branchIds}::uuid[])`;
  }
  private async company(id: string) {
    return this.prisma.company.findUniqueOrThrow({ where: { id } });
  }

  async sales(scope: CompanyScope, q: RangeQuery): Promise<SalesReportDto> {
    const f = await this.docFilter(scope, q.branchId, 'i.branch_id');
    const lf = await ledgerBranchFilter(this.prisma, scope, q.branchId, Prisma.raw('l.branch_id'));
    const company = await this.company(scope.companyId);
    const settings = await this.prisma.postingSettings.findUnique({ where: { companyId: scope.companyId } });
    const labourAcc = settings?.labourRevenueAccountId ?? null;
    const partsAcc = settings?.partsRevenueAccountId ?? null;
    const docs = Prisma.sql`
      SELECT i.id, i.kind, i.branch_id, i.customer_id, i.journal_id, i.tax_amount, i.total, i.discount_amount, j.posting_date,
             CASE WHEN i.kind = 'credit_note' THEN -1 ELSE 1 END AS sign
        FROM workshop.invoice i JOIN accounting.journal j ON j.id = i.journal_id
       WHERE i.company_id = ${scope.companyId}::uuid AND j.posting_date BETWEEN ${q.from}::date AND ${q.to}::date ${f}`;
    const r = await this.prisma.$transaction(async (tx) => {
      const [totals] = await tx.$queryRaw<
        { invoices: bigint; credits: bigint; sales: Dec; tax: Dec; discount: Dec }[]
      >`WITH d AS (${docs})
        SELECT count(*) FILTER (WHERE kind = 'invoice') AS invoices, count(*) FILTER (WHERE kind = 'credit_note') AS credits,
               coalesce(sum(sign * (total - tax_amount)), 0) AS sales, coalesce(sum(sign * tax_amount), 0) AS tax,
               coalesce(sum(sign * discount_amount), 0) AS discount FROM d`;
      const split = await tx.$queryRaw<{ account_id: string; amount: Dec }[]>`
        WITH d AS (${docs})
        SELECT jl.account_id, coalesce(sum(jl.credit - jl.debit), 0) AS amount
          FROM d JOIN accounting.journal_line jl ON jl.journal_id = d.journal_id
         WHERE jl.account_id = ANY(${[labourAcc, partsAcc].filter((x): x is string => !!x)}::uuid[])
         GROUP BY jl.account_id`;
      const byBranch = await tx.$queryRaw<{ code: string; invoices: bigint; sales: Dec }[]>`
        WITH d AS (${docs})
        SELECT b.code, count(*) FILTER (WHERE d.kind = 'invoice') AS invoices, coalesce(sum(d.sign * (d.total - d.tax_amount)), 0) AS sales
          FROM d JOIN org.branch b ON b.id = d.branch_id GROUP BY b.code ORDER BY b.code`;
      const byMonth = await tx.$queryRaw<{ month: string; sales: Dec }[]>`
        WITH d AS (${docs})
        SELECT to_char(posting_date, 'YYYY-MM') AS month, coalesce(sum(sign * (total - tax_amount)), 0) AS sales
          FROM d GROUP BY 1 ORDER BY 1`;
      const top = await tx.$queryRaw<{ kind: string; description: string; qty: Dec; amount: Dec }[]>`
        WITH d AS (${docs})
        SELECT l.kind, l.description, coalesce(sum(d.sign * l.hours), 0) AS qty, coalesce(sum(d.sign * l.amount), 0) AS amount
          FROM d JOIN workshop.invoice_line l ON l.invoice_id = d.id
         GROUP BY l.kind, l.description HAVING sum(d.sign * l.amount) <> 0
         ORDER BY sum(d.sign * l.amount) DESC, l.description LIMIT 40`;
      const [ledger] = await tx.$queryRaw<{ revenue: Dec }[]>`
        SELECT coalesce(sum(l.credit - l.debit), 0) AS revenue FROM reporting.ledger_line l
         WHERE l.company_id = ${scope.companyId}::uuid AND l.account_type = 'revenue'
           AND l.posting_date BETWEEN ${q.from}::date AND ${q.to}::date ${lf}`;
      return { totals: totals!, split, byBranch, byMonth, top, ledger: new D(ledger!.revenue) };
    }, RR);
    const amountOf = (acc: string | null) => new D(r.split.find((s) => s.account_id === acc)?.amount ?? 0);
    const labour = amountOf(labourAcc);
    const parts = amountOf(partsAcc);
    const sales = new D(r.totals.sales);
    const standing = Number(r.totals.invoices) - Number(r.totals.credits);
    return {
      from: q.from,
      to: q.to,
      branchId: q.branchId ?? null,
      currency: company.baseCurrency,
      invoices: Number(r.totals.invoices),
      creditNotes: Number(r.totals.credits),
      sales: money(sales),
      labourRevenue: money(labour),
      partsRevenue: money(parts),
      partsSharePct: percent(parts, sales),
      discounts: money(r.totals.discount),
      tax: money(r.totals.tax),
      averageInvoice:
        standing > 0 ? sales.dividedBy(standing).toDecimalPlaces(2, D.ROUND_HALF_UP).toFixed(2) : null,
      ledgerRevenue: money(r.ledger),
      otherRevenue: money(r.ledger.minus(sales)),
      byBranch: r.byBranch.map((b) => ({
        branchCode: b.code,
        invoices: Number(b.invoices),
        sales: money(b.sales),
      })),
      byMonth: r.byMonth.map((m) => ({ month: m.month, sales: money(m.sales) })),
      topParts: r.top
        .filter((t) => t.kind === 'part')
        .slice(0, 10)
        .map((t) => ({
          description: t.description,
          quantity: new D(t.qty).toFixed(3),
          amount: money(t.amount),
        })),
      topServices: r.top
        .filter((t) => t.kind === 'labour')
        .slice(0, 10)
        .map((t) => ({
          description: t.description,
          quantity: new D(t.qty).toFixed(2),
          amount: money(t.amount),
        })),
      asOf: new Date().toISOString(),
    };
  }

  async operations(scope: CompanyScope, q: RangeQuery): Promise<OperationsReportDto> {
    const f = await this.docFilter(scope, q.branchId, 'j.branch_id');
    const company = await this.company(scope.companyId);
    const tz = company.timezone;
    const start = Prisma.sql`(${q.from}::date)::timestamp AT TIME ZONE ${tz}`;
    const end = Prisma.sql`(${q.to}::date + 1)::timestamp AT TIME ZONE ${tz}`;
    const r = await this.prisma.$transaction(async (tx) => {
      const [k] = await tx.$queryRaw<
        {
          opened: bigint;
          cancelled: bigint;
          delivered: bigint;
          first_time: bigint;
          avg_h: Dec | null;
          median_h: Dec | null;
        }[]
      >`
        SELECT count(*) FILTER (WHERE j.created_at >= ${start} AND j.created_at < ${end}) AS opened,
               count(*) FILTER (WHERE j.created_at >= ${start} AND j.created_at < ${end} AND j.status = 'cancelled') AS cancelled,
               count(*) FILTER (WHERE j.delivered_at >= ${start} AND j.delivered_at < ${end}) AS delivered,
               count(*) FILTER (WHERE j.delivered_at >= ${start} AND j.delivered_at < ${end} AND j.rework_count = 0) AS first_time,
               avg(extract(epoch FROM j.delivered_at - j.created_at) / 3600) FILTER (WHERE j.delivered_at >= ${start} AND j.delivered_at < ${end}) AS avg_h,
               percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM j.delivered_at - j.created_at) / 3600)
                 FILTER (WHERE j.delivered_at >= ${start} AND j.delivered_at < ${end}) AS median_h
          FROM workshop.job_card j WHERE j.company_id = ${scope.companyId}::uuid ${f}`;
      const open = await tx.$queryRaw<{ status: string; n: bigint; overdue: bigint }[]>`
        SELECT j.status, count(*) AS n, count(*) FILTER (WHERE j.promised_at < now()) AS overdue
          FROM workshop.job_card j
         WHERE j.company_id = ${scope.companyId}::uuid AND j.status NOT IN ('delivered', 'cancelled') ${f}
         GROUP BY j.status`;
      const byBranch = await tx.$queryRaw<{ code: string; opened: bigint; delivered: bigint }[]>`
        SELECT b.code,
               count(*) FILTER (WHERE j.created_at >= ${start} AND j.created_at < ${end}) AS opened,
               count(*) FILTER (WHERE j.delivered_at >= ${start} AND j.delivered_at < ${end}) AS delivered
          FROM workshop.job_card j JOIN org.branch b ON b.id = j.branch_id
         WHERE j.company_id = ${scope.companyId}::uuid ${f} GROUP BY b.code ORDER BY b.code`;
      return { k: k!, open, byBranch };
    }, RR);
    const hours = (v: Dec | null) =>
      v === null ? null : new D(v).toDecimalPlaces(1, D.ROUND_HALF_UP).toFixed(1);
    const delivered = Number(r.k.delivered);
    return {
      from: q.from,
      to: q.to,
      branchId: q.branchId ?? null,
      opened: Number(r.k.opened),
      cancelled: Number(r.k.cancelled),
      delivered,
      firstTimeRightPct: percent(Number(r.k.first_time), delivered),
      averageHoursToDeliver: hours(r.k.avg_h),
      medianHoursToDeliver: hours(r.k.median_h),
      openNow: r.open.reduce((s, o) => s + Number(o.n), 0),
      overdueNow: r.open.reduce((s, o) => s + Number(o.overdue), 0),
      openByStatus: r.open.map((o) => ({ status: o.status, count: Number(o.n), overdue: Number(o.overdue) })),
      byBranch: r.byBranch
        .filter((b) => Number(b.opened) || Number(b.delivered))
        .map((b) => ({ branchCode: b.code, opened: Number(b.opened), delivered: Number(b.delivered) })),
      asOf: new Date().toISOString(),
    };
  }

  async customers(scope: CompanyScope, q: RangeQuery): Promise<CustomersReportDto> {
    const f = await this.docFilter(scope, q.branchId, 'i.branch_id');
    const company = await this.company(scope.companyId);
    const tz = company.timezone;
    const r = await this.prisma.$transaction(async (tx) => {
      const [c] = await tx.$queryRaw<{ total: bigint; created: bigint }[]>`
        SELECT count(*) AS total,
               count(*) FILTER (WHERE created_at >= (${q.from}::date)::timestamp AT TIME ZONE ${tz}
                                  AND created_at < (${q.to}::date + 1)::timestamp AT TIME ZONE ${tz}) AS created
          FROM crm.customer WHERE company_id = ${scope.companyId}::uuid`;
      const rows = await tx.$queryRaw<
        {
          customer_id: string;
          name: string;
          invoices: bigint;
          sales: Dec;
          last_date: Date;
          before: boolean;
        }[]
      >`
        WITH d AS (
          SELECT i.customer_id, i.customer_name, i.kind, i.total, i.tax_amount, j.posting_date
            FROM workshop.invoice i JOIN accounting.journal j ON j.id = i.journal_id
           WHERE i.company_id = ${scope.companyId}::uuid ${f})
        SELECT customer_id, max(customer_name) AS name,
               count(*) FILTER (WHERE kind = 'invoice' AND posting_date BETWEEN ${q.from}::date AND ${q.to}::date) AS invoices,
               coalesce(sum(CASE WHEN kind = 'credit_note' THEN -1 ELSE 1 END * (total - tax_amount))
                        FILTER (WHERE posting_date BETWEEN ${q.from}::date AND ${q.to}::date), 0) AS sales,
               max(posting_date) FILTER (WHERE posting_date <= ${q.to}::date) AS last_date,
               bool_or(kind = 'invoice' AND posting_date < ${q.from}::date) AS before
          FROM d GROUP BY customer_id`;
      return { c: c!, rows };
    }, RR);
    const active = r.rows.filter((x) => Number(x.invoices) > 0);
    return {
      from: q.from,
      to: q.to,
      branchId: q.branchId ?? null,
      currency: company.baseCurrency,
      totalCustomers: Number(r.c.total),
      newCustomers: Number(r.c.created),
      activeCustomers: active.length,
      returningCustomers: active.filter((x) => x.before).length,
      returningPct: percent(active.filter((x) => x.before).length, active.length),
      topCustomers: active
        .sort((a, b) => new D(b.sales).comparedTo(new D(a.sales)) || a.name.localeCompare(b.name))
        .slice(0, 15)
        .map((x) => ({
          customerId: x.customer_id,
          name: x.name,
          invoices: Number(x.invoices),
          sales: money(x.sales),
          lastInvoiceDate: x.last_date ? x.last_date.toISOString().slice(0, 10) : null,
          returning: x.before,
        })),
      asOf: new Date().toISOString(),
    };
  }

  async stockMovement(scope: CompanyScope, q: RangeQuery): Promise<StockMovementReportDto> {
    const f = await this.docFilter(scope, q.branchId, 'm.branch_id');
    const lf = await ledgerBranchFilter(this.prisma, scope, q.branchId, Prisma.raw('l.branch_id'));
    const company = await this.company(scope.companyId);
    const tz = company.timezone;
    const start = Prisma.sql`(${q.from}::date)::timestamp AT TIME ZONE ${tz}`;
    const end = Prisma.sql`(${q.to}::date + 1)::timestamp AT TIME ZONE ${tz}`;
    const r = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        {
          part_id: string;
          sku: string;
          name: string;
          unit: string;
          open_qty: Dec;
          open_val: Dec;
          close_qty: Dec;
          close_val: Dec;
          issued_qty: Dec;
          issued_val: Dec;
          received_qty: Dec;
          last_issue: Date | null;
        }[]
      >`
        WITH m AS (SELECT * FROM inventory.stock_movement m WHERE m.company_id = ${scope.companyId}::uuid ${f}),
        opening AS (SELECT DISTINCT ON (branch_id, part_id) branch_id, part_id, on_hand_after, value_after
                      FROM m WHERE created_at < ${start} ORDER BY branch_id, part_id, created_at DESC, number DESC),
        closing AS (SELECT DISTINCT ON (branch_id, part_id) branch_id, part_id, on_hand_after, value_after
                      FROM m WHERE created_at < ${end} ORDER BY branch_id, part_id, created_at DESC, number DESC),
        flows AS (SELECT part_id,
                         coalesce(sum(CASE kind WHEN 'issue' THEN quantity WHEN 'return' THEN -quantity END), 0) AS issued_qty,
                         coalesce(sum(CASE kind WHEN 'issue' THEN value WHEN 'return' THEN -value END), 0) AS issued_val,
                         coalesce(sum(quantity) FILTER (WHERE kind = 'receipt'), 0) AS received_qty
                    FROM m WHERE created_at >= ${start} AND created_at < ${end} GROUP BY part_id),
        last_issue AS (SELECT part_id, max(created_at) AS at FROM m WHERE kind = 'issue' AND created_at < ${end} GROUP BY part_id),
        parts AS (SELECT part_id FROM closing UNION SELECT part_id FROM opening UNION SELECT part_id FROM flows)
        SELECT p.id AS part_id, p.sku, p.name, p.unit,
               coalesce((SELECT sum(on_hand_after) FROM opening o WHERE o.part_id = p.id), 0) AS open_qty,
               coalesce((SELECT sum(value_after) FROM opening o WHERE o.part_id = p.id), 0) AS open_val,
               coalesce((SELECT sum(on_hand_after) FROM closing c WHERE c.part_id = p.id), 0) AS close_qty,
               coalesce((SELECT sum(value_after) FROM closing c WHERE c.part_id = p.id), 0) AS close_val,
               coalesce(fl.issued_qty, 0) AS issued_qty, coalesce(fl.issued_val, 0) AS issued_val,
               coalesce(fl.received_qty, 0) AS received_qty, li.at AS last_issue
          FROM parts x JOIN inventory.part p ON p.id = x.part_id
          LEFT JOIN flows fl ON fl.part_id = p.id LEFT JOIN last_issue li ON li.part_id = p.id
         ORDER BY p.sku`;
      const settings = await tx.postingSettings.findUnique({ where: { companyId: scope.companyId } });
      let ledger: Dec | null = null;
      if (settings?.inventoryAccountId) {
        const [l] = await tx.$queryRaw<{ bal: Dec }[]>`
          SELECT coalesce(sum(l.debit - l.credit), 0) AS bal FROM reporting.ledger_line l
           WHERE l.company_id = ${scope.companyId}::uuid AND l.account_id = ${settings.inventoryAccountId}::uuid
             AND l.posting_date <= ${q.to}::date ${lf}`;
        ledger = new D(l!.bal);
      }
      return { rows, ledger };
    }, RR);
    const classes = classifyStock(
      r.rows.map((x) => ({
        key: x.part_id,
        issuedValue: new D(x.issued_val),
        closingQty: new D(x.close_qty),
      })),
    );
    const turnover = (issued: Dec, open: Dec, close: Dec) => {
      const avg = open.plus(close).dividedBy(2);
      return avg.isZero() ? null : issued.dividedBy(avg).toDecimalPlaces(2, D.ROUND_HALF_UP).toFixed(2);
    };
    const sum = (k: 'open_val' | 'close_val' | 'issued_val') =>
      r.rows.reduce((s, x) => s.plus(x[k]), new D(0));
    const [ov, cv, iv] = [sum('open_val'), sum('close_val'), sum('issued_val')];
    const localDate = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(d);
    return {
      from: q.from,
      to: q.to,
      branchId: q.branchId ?? null,
      currency: company.baseCurrency,
      openingValue: money(ov),
      closingValue: money(cv),
      issuedValue: money(iv),
      turnover: turnover(iv, ov, cv),
      ledgerInventory: r.ledger ? money(r.ledger) : null,
      reconciled: r.ledger ? r.ledger.equals(cv) : false,
      counts: {
        fast: [...classes.values()].filter((c) => c === 'fast').length,
        slow: [...classes.values()].filter((c) => c === 'slow').length,
        dead: [...classes.values()].filter((c) => c === 'dead').length,
      },
      parts: r.rows
        .map((x) => ({
          partId: x.part_id,
          sku: x.sku,
          name: x.name,
          unit: x.unit,
          openingQty: new D(x.open_qty).toFixed(3),
          receivedQty: new D(x.received_qty).toFixed(3),
          issuedQty: new D(x.issued_qty).toFixed(3),
          closingQty: new D(x.close_qty).toFixed(3),
          issuedValue: money(x.issued_val),
          closingValue: money(x.close_val),
          turnover: turnover(new D(x.issued_val), new D(x.open_val), new D(x.close_val)),
          lastIssueDate: x.last_issue ? localDate(x.last_issue) : null,
          class: classes.get(x.part_id)!,
        }))
        .sort((a, b) => new D(b.issuedValue).comparedTo(new D(a.issuedValue)) || a.sku.localeCompare(b.sku)),
      asOf: new Date().toISOString(),
    };
  }
}
