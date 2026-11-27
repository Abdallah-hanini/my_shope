import { Injectable } from '@nestjs/common';
import { Prisma, type Company } from '@prisma/client';
import { createTranslator, formatDateTime, type Locale, type MessageKey } from '@erp/localization';
import { minorUnits, type CreateExportInput } from '@erp/validation';
import type { CompanyScope } from '../auth/principal';
import { DomainError } from '../common/errors';
import { PrismaService } from '../infra/prisma.service';
import { AnalyticsService } from '../reporting/analytics.service';
import { LedgerService } from '../reporting/ledger.service';
import { StatementsService } from '../reporting/statements.service';
import { reportTable } from './report-builders';
import { ledgerBranchFilter } from '../reporting/report-scope';
import type { ExportRow, ExportTable } from './table';

/** Largest number of data rows in one file; bigger exports must narrow the range. */
export const MAX_EXPORT_ROWS = 200_000;
const ZERO = /^-?0(\.0+)?$/;

export class ExportTooLarge extends DomainError {
  constructor() {
    super(422, `The export has more than ${MAX_EXPORT_ROWS} rows; narrow the date range or choose a branch`);
  }
}

/** Splits a signed balance (positive = debit) into debit and credit columns; zero is blank. */
export function split(signed: string): [string, string] {
  if (ZERO.test(signed)) return ['', ''];
  return signed.startsWith('-') ? ['', signed.slice(1)] : [signed, ''];
}

export interface BuildContext {
  company: Company;
  scope: CompanyScope;
  locale: Locale;
  requesterName: string;
}

/**
 * Builds the export table for each kind from the same services the screens use, so a file always
 * equals the screen for the same filters (SECURITY_QA "report export equality").
 */
@Injectable()
export class ExportBuilders {
  /** General-ledger page size used while collecting all lines (tests lower it to exercise paging). */
  static glPageSize = 500;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly statements: StatementsService,
    private readonly analytics: AnalyticsService,
  ) {}

  async build(input: CreateExportInput, ctx: BuildContext): Promise<ExportTable> {
    switch (input.kind) {
      case 'trial_balance':
        return this.trialBalance(input.params, ctx);
      case 'general_ledger':
        return this.generalLedger(input.params, ctx);
      case 'journal_lines':
        return this.journalLines(input.params, ctx);
      default: {
        // Statements and analytics (RPT R2b2): the same services as their screens.
        const p = input.params as {
          from?: string;
          to: string;
          branchId?: string;
          compare?: 'none' | 'previous';
        };
        const { t, title, moneyScale, rtl } = this.base(ctx, input.kind);
        const r = await reportTable(input.kind, p, ctx, t, {
          statements: this.statements,
          analytics: this.analytics,
        });
        return {
          title,
          moneyScale,
          rtl,
          meta: [...(await this.commonMeta(ctx, input.kind, p)), ...r.meta],
          columns: r.columns,
          rows: r.rows,
        };
      }
    }
  }

  private async commonMeta(
    ctx: BuildContext,
    kind: CreateExportInput['kind'],
    p: { from?: string; to: string; branchId?: string },
  ): Promise<[string, string][]> {
    const t = createTranslator(ctx.locale);
    const branch = p.branchId
      ? await this.prisma.branch.findUnique({
          where: { companyId_id: { companyId: ctx.company.id, id: p.branchId } },
        })
      : null;
    const name = (x: { name: string; nameAr?: string | null }) =>
      ctx.locale === 'ar' && x.nameAr ? x.nameAr : x.name;
    const now = new Date();
    return [
      [t('export.meta.report'), t(`export.kind.${kind}` as MessageKey)],
      [
        t('export.meta.company'),
        ctx.locale === 'ar' && ctx.company.legalNameAr ? ctx.company.legalNameAr : ctx.company.legalName,
      ],
      p.from ? [t('export.meta.period'), `${p.from} – ${p.to}`] : [t('rpt.asOf'), p.to],
      [t('export.meta.branch'), branch ? `${branch.code} — ${name(branch)}` : t('export.meta.allBranches')],
      [
        t('export.meta.scope'),
        ctx.scope.allBranches ? t('export.meta.scopeCompany') : t('export.meta.scopeBranches'),
      ],
      [t('export.meta.currency'), ctx.company.baseCurrency],
      [
        t('export.meta.generatedAt'),
        `${formatDateTime(ctx.locale, now, ctx.company.timezone)} (${now.toISOString()})`,
      ],
      [t('export.meta.generatedBy'), ctx.requesterName],
      [t('export.meta.source'), t('export.meta.sourceValue')],
    ];
  }

  private base(ctx: BuildContext, kind: CreateExportInput['kind']) {
    const t = createTranslator(ctx.locale);
    return {
      t,
      title: t(`export.kind.${kind}` as MessageKey),
      moneyScale: minorUnits(ctx.company.baseCurrency),
      rtl: ctx.locale === 'ar',
      name: (x: { name: string; nameAr?: string | null }) =>
        ctx.locale === 'ar' && x.nameAr ? x.nameAr : x.name,
    };
  }

  private async trialBalance(
    p: Extract<CreateExportInput, { kind: 'trial_balance' }>['params'],
    ctx: BuildContext,
  ): Promise<ExportTable> {
    const { t, title, moneyScale, rtl, name } = this.base(ctx, 'trial_balance');
    const tb = await this.ledger.trialBalance(ctx.scope, { ...p, branchId: p.branchId });
    const rows: ExportRow[] = tb.rows.map((r) => {
      const [od, oc] = split(r.opening);
      const [cd, cc] = split(r.closing);
      return {
        code: r.account.code,
        account: name(r.account),
        level: r.level,
        header: r.account.isPosting ? '' : t('export.meta.yes'),
        openingDebit: od,
        openingCredit: oc,
        periodDebit: r.periodDebit,
        periodCredit: r.periodCredit,
        closingDebit: cd,
        closingCredit: cc,
        $bold: !r.account.isPosting,
        $indent: r.level,
      };
    });
    rows.push({
      code: '',
      account: t('export.row.totals'),
      level: null,
      header: '',
      openingDebit: tb.totals.openingDebit,
      openingCredit: tb.totals.openingCredit,
      periodDebit: tb.totals.periodDebit,
      periodCredit: tb.totals.periodCredit,
      closingDebit: tb.totals.closingDebit,
      closingCredit: tb.totals.closingCredit,
      $bold: true,
    });
    return {
      title,
      moneyScale,
      rtl,
      meta: [
        ...(await this.commonMeta(ctx, 'trial_balance', p)),
        [t('export.meta.balanced'), tb.balanced ? t('export.meta.yes') : t('export.meta.no')],
        [t('export.meta.periodResult'), `${tb.periodResult} ${tb.currency}`],
      ],
      columns: [
        { key: 'code', header: t('export.col.code'), kind: 'text', width: 10 },
        { key: 'account', header: t('export.col.account'), kind: 'text', width: 36 },
        { key: 'level', header: t('export.col.level'), kind: 'int' },
        { key: 'header', header: t('export.col.header'), kind: 'text', width: 12 },
        { key: 'openingDebit', header: t('export.col.openingDebit'), kind: 'money' },
        { key: 'openingCredit', header: t('export.col.openingCredit'), kind: 'money' },
        { key: 'periodDebit', header: t('export.col.periodDebit'), kind: 'money' },
        { key: 'periodCredit', header: t('export.col.periodCredit'), kind: 'money' },
        { key: 'closingDebit', header: t('export.col.closingDebit'), kind: 'money' },
        { key: 'closingCredit', header: t('export.col.closingCredit'), kind: 'money' },
      ],
      rows,
    };
  }

  private async generalLedger(
    p: Extract<CreateExportInput, { kind: 'general_ledger' }>['params'],
    ctx: BuildContext,
  ): Promise<ExportTable> {
    const { t, title, moneyScale, rtl, name } = this.base(ctx, 'general_ledger');
    const sideLabel = (signed: string) =>
      ZERO.test(signed) ? '' : signed.startsWith('-') ? t('ledger.cr') : t('ledger.dr');
    const abs = (signed: string) => (signed.startsWith('-') ? signed.slice(1) : signed);
    const rows: ExportRow[] = [];
    let cursor: string | undefined;
    let first: Awaited<ReturnType<LedgerService['generalLedger']>> | undefined;
    do {
      const page = await this.ledger.generalLedger(ctx.scope, {
        ...p,
        cursor,
        limit: ExportBuilders.glPageSize,
      });
      if (!first) {
        first = page;
        rows.push({
          date: '',
          journal: '',
          description: t('export.row.opening'),
          source: '',
          debit: '',
          credit: '',
          balance: abs(page.opening),
          side: sideLabel(page.opening),
          $bold: true,
        });
      }
      for (const l of page.lines) {
        rows.push({
          date: l.postingDate,
          journal: l.journalNumber,
          description: l.description,
          source: t(`journal.source.${l.sourceType}` as MessageKey),
          debit: l.debit,
          credit: l.credit,
          balance: abs(l.balance),
          side: sideLabel(l.balance),
        });
      }
      if (rows.length > MAX_EXPORT_ROWS) throw new ExportTooLarge();
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    const g = first!;
    rows.push({
      date: '',
      journal: '',
      description: t('export.row.closing'),
      source: '',
      debit: g.periodDebit,
      credit: g.periodCredit,
      balance: abs(g.closing),
      side: sideLabel(g.closing),
      $bold: true,
    });
    return {
      title,
      moneyScale,
      rtl,
      meta: [
        ...(await this.commonMeta(ctx, 'general_ledger', p)),
        [t('export.meta.account'), `${g.account.code} — ${name(g.account)}`],
      ],
      columns: [
        { key: 'date', header: t('export.col.date'), kind: 'date' },
        { key: 'journal', header: t('export.col.journal'), kind: 'text', width: 16 },
        { key: 'description', header: t('export.col.description'), kind: 'text', width: 44 },
        { key: 'source', header: t('export.col.source'), kind: 'text', width: 12 },
        { key: 'debit', header: t('export.col.debit'), kind: 'money' },
        { key: 'credit', header: t('export.col.credit'), kind: 'money' },
        { key: 'balance', header: t('export.col.balance'), kind: 'money' },
        { key: 'side', header: t('export.col.side'), kind: 'text', width: 8 },
      ],
      rows,
    };
  }

  private async journalLines(
    p: Extract<CreateExportInput, { kind: 'journal_lines' }>['params'],
    ctx: BuildContext,
  ): Promise<ExportTable> {
    const { t, title, moneyScale, rtl } = this.base(ctx, 'journal_lines');
    const bf = await ledgerBranchFilter(this.prisma, ctx.scope, p.branchId, Prisma.raw('l.branch_id'));
    type Line = {
      posting_date: Date;
      journal_number: string;
      line_no: number;
      branch_code: string | null;
      account_code: string;
      account_name: string;
      account_name_ar: string | null;
      description: string;
      source_type: string;
      debit: Prisma.Decimal;
      credit: Prisma.Decimal;
    };
    const lines = await this.prisma.$queryRaw<Line[]>`
      SELECT l.posting_date, l.journal_number, l.line_no, b.code AS branch_code, l.account_code,
             a.name AS account_name, a.name_ar AS account_name_ar, l.description,
             l.source_type::text AS source_type, l.debit, l.credit
        FROM reporting.ledger_line l
        JOIN accounting.account a ON a.id = l.account_id AND a.company_id = l.company_id
        LEFT JOIN org.branch b ON b.id = l.branch_id AND b.company_id = l.company_id
       WHERE l.company_id = ${ctx.company.id}::uuid
         AND l.posting_date BETWEEN ${p.from}::date AND ${p.to}::date ${bf}
       ORDER BY l.posting_date, l.journal_number, l.line_no
       LIMIT ${MAX_EXPORT_ROWS + 1}`;
    if (lines.length > MAX_EXPORT_ROWS) throw new ExportTooLarge();
    const money = (v: Prisma.Decimal) => v.toFixed(moneyScale);
    let debit = new Prisma.Decimal(0);
    let credit = new Prisma.Decimal(0);
    const rows: ExportRow[] = lines.map((l) => {
      debit = debit.plus(l.debit);
      credit = credit.plus(l.credit);
      return {
        date: l.posting_date.toISOString().slice(0, 10),
        journal: l.journal_number,
        line: l.line_no,
        branch: l.branch_code ?? '',
        code: l.account_code,
        account: ctx.locale === 'ar' && l.account_name_ar ? l.account_name_ar : l.account_name,
        description: l.description,
        source: t(`journal.source.${l.source_type}` as MessageKey),
        debit: money(l.debit),
        credit: money(l.credit),
      };
    });
    rows.push({
      date: '',
      journal: '',
      line: null,
      branch: '',
      code: '',
      account: '',
      description: t('export.row.totals'),
      source: '',
      debit: money(debit),
      credit: money(credit),
      $bold: true,
    });
    return {
      title,
      moneyScale,
      rtl,
      meta: await this.commonMeta(ctx, 'journal_lines', p),
      columns: [
        { key: 'date', header: t('export.col.date'), kind: 'date' },
        { key: 'journal', header: t('export.col.journal'), kind: 'text', width: 16 },
        { key: 'line', header: t('export.col.line'), kind: 'int' },
        { key: 'branch', header: t('export.col.branch'), kind: 'text', width: 10 },
        { key: 'code', header: t('export.col.code'), kind: 'text', width: 10 },
        { key: 'account', header: t('export.col.account'), kind: 'text', width: 30 },
        { key: 'description', header: t('export.col.description'), kind: 'text', width: 40 },
        { key: 'source', header: t('export.col.source'), kind: 'text', width: 12 },
        { key: 'debit', header: t('export.col.debit'), kind: 'money' },
        { key: 'credit', header: t('export.col.credit'), kind: 'money' },
      ],
      rows,
    };
  }
}
