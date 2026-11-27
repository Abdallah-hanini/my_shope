import type { createTranslator, MessageKey } from '@erp/localization';
import type { ExportKind } from '@erp/validation';
import type { AnalyticsService } from '../reporting/analytics.service';
import type { StatementsService } from '../reporting/statements.service';
import type { BuildContext } from './builders';
import type { ExportColumn, ExportRow } from './table';

type T = ReturnType<typeof createTranslator>;
type Params = { from?: string; to: string; branchId?: string; compare?: 'none' | 'previous' };
type Section = {
  lines: {
    code: string;
    name: string;
    nameAr?: string | null;
    amount: string;
    previous?: string | null;
    changePct?: string | null;
  }[];
  total: string;
  previousTotal?: string | null;
};
export interface ReportPart {
  meta: [string, string][];
  columns: ExportColumn[];
  rows: ExportRow[];
}

const yesNo = (t: T, v: boolean) => (v ? t('export.meta.yes') : t('export.meta.no'));

/**
 * Export tables for the statements and analytics reports (RPT R2b2). Each reads the same service as
 * its screen with the same filters, so a file always equals what the report shows.
 */
export async function reportTable(
  kind: ExportKind,
  p: Params,
  ctx: BuildContext,
  t: T,
  s: { statements: StatementsService; analytics: AnalyticsService },
): Promise<ReportPart> {
  const name = (x: { name: string; nameAr?: string | null }) =>
    ctx.locale === 'ar' && x.nameAr ? x.nameAr : x.name;
  const range = { from: p.from!, to: p.to, branchId: p.branchId };
  const asOf = { asOf: p.to, branchId: p.branchId };
  const sectionRows = (title: string, sec: Section, compare: boolean): ExportRow[] => [
    { code: '', account: title, amount: '', previous: '', change: '', $bold: true },
    ...sec.lines.map((l) => ({
      code: l.code,
      account: name(l),
      amount: l.amount,
      previous: compare ? (l.previous ?? '') : '',
      change: compare ? (l.changePct ?? '') : '',
      $indent: 1,
    })),
    {
      code: '',
      account: `${t('rpt.total')} ${title.toLowerCase()}`,
      amount: sec.total,
      previous: compare ? (sec.previousTotal ?? '') : '',
      change: '',
      $bold: true,
    },
  ];
  const statementCols = (compare: boolean): ExportColumn[] => [
    { key: 'code', header: t('export.col.code'), kind: 'text', width: 10 },
    { key: 'account', header: t('export.col.account'), kind: 'text', width: 40 },
    { key: 'amount', header: compare ? t('rpt.thisPeriod') : t('rpt.balance'), kind: 'money' },
    ...(compare
      ? ([
          { key: 'previous', header: t('rpt.previousPeriod'), kind: 'money' },
          { key: 'change', header: `${t('rpt.change')} %`, kind: 'text', width: 10 },
        ] as ExportColumn[])
      : []),
  ];

  switch (kind) {
    case 'profit_and_loss': {
      const r = await s.statements.profitAndLoss(ctx.scope, { ...range, compare: p.compare ?? 'previous' });
      const compare = !!r.previousFrom;
      const result = (
        label: string,
        f: { amount: string; previous: string | null; changePct: string | null },
      ) => ({
        code: '',
        account: label,
        amount: f.amount,
        previous: compare ? (f.previous ?? '') : '',
        change: compare ? (f.changePct ?? '') : '',
        $bold: true,
      });
      return {
        meta: [
          ...(compare
            ? ([[t('rpt.comparedWith'), `${r.previousFrom} – ${r.previousTo}`]] as [string, string][])
            : []),
          [t('rpt.margin'), r.grossMarginPct ? `${r.grossMarginPct}%` : '—'],
        ],
        columns: statementCols(compare),
        rows: [
          ...sectionRows(t('rpt.revenue'), r.revenue, compare),
          ...sectionRows(t('rpt.costOfSales'), r.costOfSales, compare),
          result(t('rpt.grossProfit'), r.grossProfit),
          ...sectionRows(t('rpt.operatingExpenses'), r.operatingExpenses, compare),
          result(t('rpt.netProfit'), r.netProfit),
        ],
      };
    }
    case 'balance_sheet': {
      const r = await s.statements.balanceSheet(ctx.scope, asOf);
      return {
        meta: [[t('rpt.bsBalanced'), yesNo(t, r.balanced)]],
        columns: statementCols(false),
        rows: [
          ...sectionRows(t('rpt.assets'), r.assets, false),
          ...sectionRows(t('rpt.liabilities'), r.liabilities, false),
          ...sectionRows(t('rpt.equity'), r.equity, false),
          { code: '', account: t('rpt.unclosedResult'), amount: r.unclosedResult, $bold: true },
          { code: '', account: t('rpt.totalLE'), amount: r.totalLiabilitiesAndEquity, $bold: true },
        ],
      };
    }
    case 'receivables_aging':
    case 'payables_aging': {
      const r =
        kind === 'receivables_aging'
          ? await s.statements.receivablesAging(ctx.scope, asOf)
          : await s.statements.payablesAging(ctx.scope, asOf);
      const bucketCols: ExportColumn[] = r.buckets.map((b) => ({
        key: b,
        header: t(`rpt.bucket.${b}` as MessageKey),
        kind: 'money',
      }));
      return {
        meta: [
          [t('rpt.controlAccount'), r.ledgerBalance ?? '—'],
          [t('rpt.reconciled'), yesNo(t, r.reconciled)],
        ],
        columns: [
          {
            key: 'party',
            header: kind === 'receivables_aging' ? t('rpt.customer') : t('rpt.supplier'),
            kind: 'text',
            width: 32,
          },
          { key: 'documents', header: t('rpt.documents'), kind: 'int' },
          ...bucketCols,
          { key: 'total', header: t('rpt.total'), kind: 'money' },
        ],
        rows: [
          ...r.parties.map((x) => ({ party: x.name, documents: x.documents, ...x.buckets, total: x.total })),
          {
            party: t('rpt.total'),
            documents: r.parties.reduce((n, x) => n + x.documents, 0),
            ...r.totals,
            total: r.total,
            $bold: true,
          },
        ],
      };
    }
    case 'cash_flow': {
      const r = await s.statements.cashFlow(ctx.scope, range);
      return {
        meta: [[t('rpt.cashReconciled'), yesNo(t, r.reconciled)]],
        columns: [
          { key: 'source', header: t('rpt.source'), kind: 'text', width: 34 },
          {
            key: 'journals',
            header: t('rpt.journalsN').replace(': {n}', '').replace('{n}', ''),
            kind: 'int',
          },
          { key: 'inflow', header: t('rpt.moneyIn'), kind: 'money' },
          { key: 'outflow', header: t('rpt.moneyOut'), kind: 'money' },
          { key: 'net', header: t('rpt.net'), kind: 'money' },
        ],
        rows: [
          { source: t('rpt.openingCash'), net: r.opening, $bold: true },
          ...r.categories.map((c) => ({
            source: t(`rpt.cf.${c.key}` as MessageKey),
            journals: c.journals,
            inflow: c.inflow,
            outflow: c.outflow,
            net: c.net,
            $indent: 1,
          })),
          { source: t('rpt.netChange'), inflow: r.inflow, outflow: r.outflow, net: r.net, $bold: true },
          { source: t('rpt.closingCash'), net: r.closing, $bold: true },
        ],
      };
    }
    case 'tax_summary': {
      const r = await s.statements.taxSummary(ctx.scope, range);
      const rows = (side: string, list: typeof r.output) =>
        list.map((x) => ({
          side,
          code: x.taxCode ?? t('rpt.noTax'),
          documents: x.documents,
          taxable: x.taxable,
          tax: x.tax,
        }));
      return {
        meta: [
          [t('rpt.outputTax'), r.outputTax],
          [t('rpt.inputTax'), r.inputTax],
          [
            r.netTax.startsWith('-') ? t('rpt.netRefundable') : t('rpt.netPayable'),
            r.netTax.replace('-', ''),
          ],
          [`${t('rpt.outputTax')} — ${t('rpt.reconciled')}`, yesNo(t, r.outputReconciled)],
          [`${t('rpt.inputTax')} — ${t('rpt.reconciled')}`, yesNo(t, r.inputReconciled)],
        ],
        columns: [
          { key: 'side', header: t('rpt.source'), kind: 'text', width: 40 },
          { key: 'code', header: t('rpt.taxCode'), kind: 'text', width: 12 },
          { key: 'documents', header: t('rpt.documents'), kind: 'int' },
          { key: 'taxable', header: t('rpt.taxable'), kind: 'money' },
          { key: 'tax', header: t('rpt.tax'), kind: 'money' },
        ],
        rows: [...rows(t('rpt.outputSide'), r.output), ...rows(t('rpt.inputSide'), r.input)],
      };
    }
    case 'sales': {
      const r = await s.analytics.sales(ctx.scope, range);
      return {
        meta: [
          [t('rpt.salesExTax'), r.sales],
          [t('rpt.labourRevenue'), r.labourRevenue],
          [t('rpt.partsRevenue'), r.partsRevenue],
          [t('rpt.averageInvoice'), r.averageInvoice ?? '—'],
          [t('rpt.discounts'), r.discounts],
          [t('rpt.tax'), r.tax],
          [t('rpt.otherRevenue'), r.otherRevenue],
        ],
        columns: [
          { key: 'group', header: t('rpt.source'), kind: 'text', width: 22 },
          { key: 'item', header: t('rpt.item'), kind: 'text', width: 40 },
          { key: 'quantity', header: t('inv.quantity'), kind: 'text', width: 12 },
          { key: 'amount', header: t('rpt.amount'), kind: 'money' },
        ],
        rows: [
          ...r.byBranch.map((b) => ({
            group: t('rpt.byBranch'),
            item: b.branchCode,
            quantity: String(b.invoices),
            amount: b.sales,
          })),
          ...r.byMonth.map((m) => ({ group: t('rpt.salesByMonth'), item: m.month, amount: m.sales })),
          ...r.topParts.map((x) => ({
            group: t('rpt.topParts'),
            item: x.description,
            quantity: x.quantity,
            amount: x.amount,
          })),
          ...r.topServices.map((x) => ({
            group: t('rpt.topServices'),
            item: x.description,
            quantity: x.quantity,
            amount: x.amount,
          })),
        ],
      };
    }
    case 'stock_movement': {
      const r = await s.analytics.stockMovement(ctx.scope, range);
      return {
        meta: [
          [t('rpt.openingStock'), r.openingValue],
          [t('rpt.closingStock'), r.closingValue],
          [t('rpt.issuedCost'), r.issuedValue],
          [t('rpt.turnover'), r.turnover ?? '—'],
          [t('rpt.reconciled'), yesNo(t, r.reconciled)],
        ],
        columns: [
          { key: 'sku', header: t('inv.sku'), kind: 'text', width: 14 },
          { key: 'name', header: t('export.col.description'), kind: 'text', width: 30 },
          { key: 'opening', header: t('rpt.opening'), kind: 'text', width: 12 },
          { key: 'received', header: t('rpt.received'), kind: 'text', width: 12 },
          { key: 'issued', header: t('rpt.issued'), kind: 'text', width: 12 },
          { key: 'closing', header: t('rpt.closing'), kind: 'text', width: 12 },
          { key: 'issuedValue', header: t('rpt.issuedCost'), kind: 'money' },
          { key: 'closingValue', header: t('rpt.closingValue'), kind: 'money' },
          { key: 'turnover', header: t('rpt.turnover'), kind: 'text', width: 10 },
          { key: 'lastIssue', header: t('rpt.lastIssue'), kind: 'date' },
          { key: 'class', header: t('rpt.classCol'), kind: 'text', width: 12 },
        ],
        rows: r.parts.map((x) => ({
          sku: x.sku,
          name: x.name,
          opening: x.openingQty,
          received: x.receivedQty,
          issued: x.issuedQty,
          closing: x.closingQty,
          issuedValue: x.issuedValue,
          closingValue: x.closingValue,
          turnover: x.turnover ?? '',
          lastIssue: x.lastIssueDate ?? '',
          class: t(`rpt.class.${x.class}` as MessageKey),
        })),
      };
    }
    default:
      throw new Error(`no export builder for ${kind}`);
  }
}
