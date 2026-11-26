import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CreateInvoiceInput,
  CreditNoteInput,
  PostingSettingsInput,
  RecordPaymentInput,
  ReleaseUnpaidInput,
} from '@erp/validation';
import { postSystemJournal } from '../accounting/posting';
import type { CompanyScope, Principal } from '../auth/principal';
import { AuthzService } from '../authz/authz.service';
import { resolveScope } from '../authz/scope';
import { conflict, forbidden, notFound, unprocessable } from '../common/errors';
import { PrismaService } from '../infra/prisma.service';
import { writeAudit, type AuditContext } from '../platform/audit';
import { formatDocumentNumber, nextDocumentNumber } from '../platform/sequence';
import { isoDate } from '../settings/effective';
import { localTime } from '../workshop/scheduling';
import { balanceOf, invoiceLines, paymentLines, reversedLines } from './billing-math';
import type { InvoiceDto, JobBillingDto, PostingSettingsDto } from './billing.dto';

type Tx = Prisma.TransactionClient;
const money = (d: Prisma.Decimal) => d.toFixed(2);
const invoiceInclude = {
  lines: { orderBy: { lineNo: 'asc' } },
  payments: { orderBy: { receivedAt: 'asc' } },
  quote: { select: { number: true } },
  creditOf: { select: { number: true } },
} satisfies Prisma.InvoiceInclude;
type InvoiceRow = Prisma.InvoiceGetPayload<{ include: typeof invoiceInclude }>;
/** Accounts invoicing needs (shown as missing on the job card). */
const BILLING_ACCOUNTS = ['labourRevenue', 'receivable', 'cash', 'card', 'bank'] as const;
/** Every posting setting, with stock (T-74). */
const ACCOUNTS = [
  ...BILLING_ACCOUNTS,
  'inventory',
  'goodsReceived',
  'stockAdjustment',
  'cogs',
  'partsRevenue',
  'payables',
  'inputTax',
  'priceVariance',
] as const;
const METHOD_ACCOUNT = { cash: 'cashAccountId', card: 'cardAccountId', bank: 'bankAccountId' } as const;
/** Account types each posting setting accepts. */
const ACCOUNT_TYPES: Record<(typeof ACCOUNTS)[number], string> = {
  labourRevenue: 'revenue',
  receivable: 'asset',
  cash: 'asset',
  card: 'asset',
  bank: 'asset',
  inventory: 'asset',
  goodsReceived: 'liability',
  stockAdjustment: 'expense',
  cogs: 'expense',
  partsRevenue: 'revenue',
  payables: 'liability',
  inputTax: 'asset',
  priceVariance: 'expense',
};

/**
 * Workshop invoices, payments and credit notes (T-72). An invoice copies the customer's approved
 * quote and posts to the ledger in the same transaction; payments (cash, card, bank) post against
 * the receivable; "on account" simply leaves a balance. A credit note cancels an unpaid invoice by
 * reversing its journal. The car leaves when the invoice is paid, or when the owner releases it.
 */
@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthzService,
  ) {}

  private async can(p: Principal, companyId: string, permission: string, branchId?: string) {
    const s = resolveScope(companyId, permission, await this.authz.grants(p.userId, companyId));
    return !!s && (branchId ? s.allBranches || s.branchIds.includes(branchId) : s.allBranches);
  }

  private async job(db: Tx | PrismaService, scope: CompanyScope, jobId: string, lock = false) {
    if (lock) await db.$queryRaw`SELECT 1 FROM workshop.job_card WHERE id = ${jobId}::uuid FOR UPDATE`;
    const j = await db.jobCard.findUnique({
      where: { companyId_id: { companyId: scope.companyId, id: jobId } },
      include: {
        customer: { select: { name: true } },
        company: { select: { timezone: true, baseCurrency: true } },
      },
    });
    if (!j || (!scope.allBranches && !scope.branchIds.includes(j.branchId))) throw notFound('Job card');
    return j;
  }

  // ── posting settings (accountant) ──────────────────────────────────────────

  async postingSettings(scope: CompanyScope, p: Principal): Promise<PostingSettingsDto> {
    const s = await this.prisma.postingSettings.findUnique({ where: { companyId: scope.companyId } });
    const ids = s ? ACCOUNTS.map((k) => s[`${k}AccountId`]).filter((x): x is string => !!x) : [];
    const accounts = await this.prisma.account.findMany({
      where: { companyId: scope.companyId, id: { in: ids } },
      select: { id: true, code: true, name: true },
    });
    const ref = (id: string | null | undefined) => accounts.find((a) => a.id === id) ?? null;
    return {
      labourRevenueAccount: ref(s?.labourRevenueAccountId),
      receivableAccount: ref(s?.receivableAccountId),
      cashAccount: ref(s?.cashAccountId),
      cardAccount: ref(s?.cardAccountId),
      bankAccount: ref(s?.bankAccountId),
      inventoryAccount: ref(s?.inventoryAccountId),
      goodsReceivedAccount: ref(s?.goodsReceivedAccountId),
      stockAdjustmentAccount: ref(s?.stockAdjustmentAccountId),
      cogsAccount: ref(s?.cogsAccountId),
      partsRevenueAccount: ref(s?.partsRevenueAccountId),
      payablesAccount: ref(s?.payablesAccountId),
      inputTaxAccount: ref(s?.inputTaxAccountId),
      priceVarianceAccount: ref(s?.priceVarianceAccountId),
      version: s?.version ?? 0,
      canManage: await this.can(p, scope.companyId, 'accounting.account.manage'),
    };
  }

  async setPostingSettings(
    scope: CompanyScope,
    p: Principal,
    input: PostingSettingsInput,
    ctx: AuditContext,
  ) {
    if (!(await this.can(p, scope.companyId, 'accounting.account.manage')))
      throw forbidden(
        'Only the accountant (chart of accounts permission for the whole company) sets posting accounts',
      );
    for (const k of ACCOUNTS) {
      const id = input[`${k}AccountId`];
      if (!id) continue;
      const a = await this.prisma.account.findUnique({
        where: { companyId_id: { companyId: scope.companyId, id } },
      });
      if (!a || !a.isPosting || a.status !== 'active' || a.type !== ACCOUNT_TYPES[k])
        throw unprocessable(`Choose an active ${ACCOUNT_TYPES[k]} posting account for ${k}`);
    }
    const data = {
      labourRevenueAccountId: input.labourRevenueAccountId,
      receivableAccountId: input.receivableAccountId,
      cashAccountId: input.cashAccountId,
      cardAccountId: input.cardAccountId,
      bankAccountId: input.bankAccountId,
      inventoryAccountId: input.inventoryAccountId ?? null,
      goodsReceivedAccountId: input.goodsReceivedAccountId ?? null,
      stockAdjustmentAccountId: input.stockAdjustmentAccountId ?? null,
      cogsAccountId: input.cogsAccountId ?? null,
      partsRevenueAccountId: input.partsRevenueAccountId ?? null,
      payablesAccountId: input.payablesAccountId ?? null,
      inputTaxAccountId: input.inputTaxAccountId ?? null,
      priceVarianceAccountId: input.priceVarianceAccountId ?? null,
    };
    await this.prisma.$transaction(async (tx) => {
      if (input.version === 0) {
        try {
          await tx.postingSettings.create({ data: { companyId: scope.companyId, ...data } });
        } catch (e) {
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
            throw conflict('The posting settings were changed by someone else; reload and try again');
          throw e;
        }
      } else {
        const n = await tx.postingSettings.updateMany({
          where: { companyId: scope.companyId, version: input.version },
          data: { ...data, version: { increment: 1 } },
        });
        if (n.count === 0)
          throw conflict('The posting settings were changed by someone else; reload and try again');
      }
      await writeAudit(tx, ctx, {
        action: 'accounting.posting_settings.set',
        entityType: 'posting_settings',
        entityId: scope.companyId,
        companyId: scope.companyId,
        after: data,
      });
    });
    return this.postingSettings(scope, p);
  }

  // ── job billing ────────────────────────────────────────────────────────────

  async jobBilling(scope: CompanyScope, p: Principal, jobId: string): Promise<JobBillingDto> {
    const job = await this.job(this.prisma, scope, jobId);
    const [docs, quote, settings, manage, owner] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { jobId },
        include: invoiceInclude,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.quote.findFirst({ where: { jobId, status: 'approved' }, orderBy: { revision: 'desc' } }),
      this.prisma.postingSettings.findUnique({ where: { companyId: scope.companyId } }),
      this.can(p, scope.companyId, 'billing.invoice.manage', job.branchId),
      this.can(p, scope.companyId, 'workshop.pricing.manage', job.branchId),
    ]);
    const names = await this.names([
      ...docs.flatMap((d) => [d.createdBy, ...d.payments.map((x) => x.receivedBy)]),
      job.unpaidReleaseBy,
    ]);
    const journals = await this.prisma.journal.findMany({
      where: { id: { in: docs.flatMap((d) => [d.journalId, ...d.payments.map((x) => x.journalId)]) } },
      select: { id: true, number: true },
    });
    const jn = (id: string) => journals.find((j) => j.id === id)?.number ?? '—';
    const live = docs.find((d) => d.kind === 'invoice' && !d.credited) ?? null;
    const owed = live
      ? balanceOf(
          live.total,
          live.payments.map((x) => x.amount),
        )
      : null;
    const missing = BILLING_ACCOUNTS.filter((k) => !settings?.[`${k}AccountId`]);
    return {
      jobId,
      currency: job.company.baseCurrency,
      documents: docs.map((d) => this.toDto(d, names, jn, manage)),
      approvedQuoteId: quote?.id ?? null,
      approvedQuoteNumber: quote?.number ?? null,
      approvedQuoteTotal: quote ? money(quote.total) : null,
      canInvoice: manage && !!quote && !live && ['ready', 'delivered'].includes(job.status),
      missingAccounts: [...missing],
      clearedForDelivery: !!job.unpaidReleaseBy || (!!owed && owed.isZero()),
      unpaidRelease: job.unpaidReleaseBy
        ? {
            byName: names.get(job.unpaidReleaseBy) ?? '—',
            at: job.unpaidReleaseAt!.toISOString(),
            reason: job.unpaidReleaseReason!,
          }
        : null,
      canReleaseUnpaid: owner && job.status === 'ready' && !job.unpaidReleaseBy && !(owed && owed.isZero()),
    };
  }

  private toDto(
    d: InvoiceRow,
    names: Map<string, string>,
    jn: (id: string) => string,
    manage: boolean,
  ): InvoiceDto {
    const balance =
      d.kind === 'invoice' && !d.credited
        ? balanceOf(
            d.total,
            d.payments.map((x) => x.amount),
          )
        : new Prisma.Decimal(0);
    const actions: string[] = [];
    if (manage && d.kind === 'invoice' && !d.credited) {
      if (balance.greaterThan(0)) actions.push('pay');
      if (!d.payments.length) actions.push('credit');
    }
    return {
      id: d.id,
      kind: d.kind,
      number: d.number,
      invoiceDate: isoDate(d.invoiceDate),
      currency: d.currency,
      customerName: d.customerName,
      quoteId: d.quoteId,
      quoteNumber: d.quote.number,
      subtotal: money(d.subtotal),
      discountAmount: money(d.discountAmount),
      netAmount: money(d.netAmount),
      taxAmount: money(d.taxAmount),
      total: money(d.total),
      taxCode: d.taxCode,
      taxPct: d.taxPct ? d.taxPct.toFixed(4) : null,
      pricesIncludeTax: d.pricesIncludeTax,
      credited: d.credited,
      creditOfNumber: d.creditOf?.number ?? null,
      reason: d.reason,
      balance: money(balance),
      journalId: d.journalId,
      journalNumber: jn(d.journalId),
      createdByName: names.get(d.createdBy) ?? '—',
      createdAt: d.createdAt.toISOString(),
      lines: d.lines.map((l) => ({
        lineNo: l.lineNo,
        kind: l.kind,
        description: l.description,
        hours: l.kind === 'part' ? l.hours.toFixed(3) : l.hours.toFixed(2),
        rate: money(l.rate),
        amount: money(l.amount),
      })),
      payments: d.payments.map((x) => ({
        id: x.id,
        number: x.number,
        method: x.method,
        amount: money(x.amount),
        reference: x.reference,
        receivedByName: names.get(x.receivedBy) ?? '—',
        receivedAt: x.receivedAt.toISOString(),
        journalNumber: jn(x.journalId),
      })),
      actions,
    };
  }

  private async names(ids: (string | null)[]) {
    const u = [...new Set(ids.filter((x): x is string => !!x))];
    const rows = u.length
      ? await this.prisma.user.findMany({ where: { id: { in: u } }, select: { id: true, displayName: true } })
      : [];
    return new Map(rows.map((r) => [r.id, r.displayName]));
  }

  private async mustBill(p: Principal, companyId: string, branchId: string) {
    if (!(await this.can(p, companyId, 'billing.invoice.manage', branchId)))
      throw forbidden('Only cashiers (invoicing permission) invoice and take payments');
  }

  private event(tx: Tx, job: { id: string; companyId: string }, actor: string, kind: string, note: string) {
    return tx.jobEvent.create({
      data: { companyId: job.companyId, jobId: job.id, actorUserId: actor, kind, note },
    });
  }

  async createInvoice(
    scope: CompanyScope,
    p: Principal,
    jobId: string,
    input: CreateInvoiceInput,
    ctx: AuditContext,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const job = await this.job(tx, scope, jobId, true);
      await this.mustBill(p, scope.companyId, job.branchId);
      if (!['ready', 'delivered'].includes(job.status))
        throw conflict('A job is invoiced once the work has passed the quality check');
      const q = await tx.quote.findFirst({
        where: { id: input.quoteId, jobId },
        include: { lines: { orderBy: { lineNo: 'asc' } } },
      });
      if (!q) throw notFound('Quote');
      if (q.status !== 'approved') throw conflict('Only a quote the customer approved is invoiced');
      const latest = await tx.quote.findFirst({
        where: { jobId, status: 'approved' },
        orderBy: { revision: 'desc' },
      });
      if (latest?.id !== q.id) throw conflict('Invoice the latest approved quote');
      if (await tx.invoice.count({ where: { jobId, kind: 'invoice', credited: false } }))
        throw conflict('This job already has an invoice; issue a credit note first to replace it');
      const settings = await tx.postingSettings.findUnique({ where: { companyId: scope.companyId } });
      if (!settings?.labourRevenueAccountId || !settings.receivableAccountId)
        throw unprocessable(
          'The accountant must choose the labour revenue and receivable accounts first (Posting accounts)',
        );
      let taxAccount: string | null = null;
      if (q.taxAmount.greaterThan(0)) {
        const code = q.taxCodeId ? await tx.taxCode.findUnique({ where: { id: q.taxCodeId } }) : null;
        if (!code?.outputAccountId)
          throw unprocessable(
            `Tax ${q.taxCode ?? ''} has no tax payable account; the accountant must set it`,
          );
        taxAccount = code.outputAccountId;
      }
      const partsSubtotal = q.lines
        .filter((l) => l.kind === 'part')
        .reduce((n, l) => n.plus(l.amount), new Prisma.Decimal(0));
      if (partsSubtotal.greaterThan(0) && !settings.partsRevenueAccountId)
        throw unprocessable('The accountant must choose the parts revenue account first (Posting accounts)');
      const today = localTime(new Date(), job.company.timezone).date;
      const year = today.slice(0, 4);
      const number = formatDocumentNumber(
        'INV',
        year,
        await nextDocumentNumber(tx, scope.companyId, 'invoice', year),
      );
      const id = (await tx.$queryRaw<{ id: string }[]>`SELECT gen_random_uuid()::text AS id`)[0]!.id;
      const journal = await postSystemJournal(
        tx,
        { ...ctx, actorUserId: p.userId },
        {
          companyId: scope.companyId,
          branchId: job.branchId,
          postingDate: today,
          description: `${number} · ${job.number} · ${job.customer.name}`,
          currency: q.currency,
          sourceType: 'invoice',
          sourceId: id,
          lines: invoiceLines(
            { total: q.total, tax: q.taxAmount, partsSubtotal, subtotal: q.subtotal },
            {
              receivable: settings.receivableAccountId,
              revenue: settings.labourRevenueAccountId,
              partsRevenue: settings.partsRevenueAccountId,
              tax: taxAccount,
            },
            number,
          ),
        },
      );
      await tx.invoice.create({
        data: {
          id,
          companyId: scope.companyId,
          branchId: job.branchId,
          jobId,
          quoteId: q.id,
          kind: 'invoice',
          number,
          invoiceDate: new Date(`${today}T00:00:00Z`),
          currency: q.currency,
          customerId: job.customerId,
          customerName: job.customer.name,
          subtotal: q.subtotal,
          discountAmount: q.discountAmount,
          netAmount: q.netAmount,
          taxAmount: q.taxAmount,
          total: q.total,
          taxCode: q.taxCode,
          taxPct: q.taxPct,
          pricesIncludeTax: q.pricesIncludeTax,
          journalId: journal.id,
          createdBy: p.userId,
          lines: {
            create: q.lines.map((l) => ({
              lineNo: l.lineNo,
              kind: l.kind,
              description: l.description,
              hours: l.hours,
              rate: l.rate,
              amount: l.amount,
            })),
          },
        },
      });
      await this.event(tx, job, p.userId, 'invoice_posted', `${number} · ${money(q.total)} ${q.currency}`);
      await writeAudit(tx, ctx, {
        action: 'billing.invoice.post',
        entityType: 'invoice',
        entityId: id,
        companyId: scope.companyId,
        branchId: job.branchId,
        after: { number, quote: q.number, total: money(q.total), journal: journal.number },
      });
    });
    return this.jobBilling(scope, p, jobId);
  }

  private async liveInvoice(tx: Tx, scope: CompanyScope, invoiceId: string) {
    await tx.$queryRaw`SELECT 1 FROM workshop.invoice WHERE id = ${invoiceId}::uuid FOR UPDATE`;
    const inv = await tx.invoice.findFirst({
      where: { id: invoiceId, companyId: scope.companyId },
      include: { payments: true, lines: { orderBy: { lineNo: 'asc' } }, job: { select: { number: true } } },
    });
    if (!inv || (!scope.allBranches && !scope.branchIds.includes(inv.branchId))) throw notFound('Invoice');
    if (inv.kind !== 'invoice' || inv.credited) throw conflict('This invoice is cancelled by a credit note');
    return inv;
  }

  async recordPayment(
    scope: CompanyScope,
    p: Principal,
    invoiceId: string,
    input: RecordPaymentInput,
    ctx: AuditContext,
  ) {
    // A repeated submission of the same form returns the payment it already recorded.
    const existing = await this.prisma.payment.findUnique({
      where: {
        companyId_idempotencyKey: { companyId: scope.companyId, idempotencyKey: input.idempotencyKey },
      },
    });
    if (existing) {
      if (existing.invoiceId !== invoiceId || !existing.amount.equals(input.amount))
        throw conflict('This payment form was already used for a different payment');
      const inv = await this.prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
      return this.jobBilling(scope, p, inv.jobId);
    }
    const jobId = await this.prisma.$transaction(async (tx) => {
      const inv = await this.liveInvoice(tx, scope, invoiceId);
      await this.mustBill(p, scope.companyId, inv.branchId);
      const owed = balanceOf(
        inv.total,
        inv.payments.map((x) => x.amount),
      );
      const amount = new Prisma.Decimal(input.amount);
      if (amount.greaterThan(owed))
        throw unprocessable(`The amount is more than the ${money(owed)} still owed`);
      const settings = await tx.postingSettings.findUnique({ where: { companyId: scope.companyId } });
      const moneyAccount = settings?.[METHOD_ACCOUNT[input.method]];
      if (!moneyAccount || !settings?.receivableAccountId)
        throw unprocessable(
          `The accountant must choose the ${input.method} account first (Posting accounts)`,
        );
      const company = await tx.company.findUniqueOrThrow({ where: { id: scope.companyId } });
      const today = localTime(new Date(), company.timezone).date;
      const year = today.slice(0, 4);
      const number = formatDocumentNumber(
        'RC',
        year,
        await nextDocumentNumber(tx, scope.companyId, 'receipt', year),
      );
      const id = (await tx.$queryRaw<{ id: string }[]>`SELECT gen_random_uuid()::text AS id`)[0]!.id;
      const journal = await postSystemJournal(
        tx,
        { ...ctx, actorUserId: p.userId },
        {
          companyId: scope.companyId,
          branchId: inv.branchId,
          postingDate: today,
          description: `${number} · ${inv.number} · ${input.method}${input.reference ? ` ${input.reference}` : ''}`,
          currency: inv.currency,
          sourceType: 'payment',
          sourceId: id,
          lines: paymentLines(
            amount,
            { money: moneyAccount, receivable: settings.receivableAccountId },
            number,
          ),
        },
      );
      await tx.payment.create({
        data: {
          id,
          companyId: scope.companyId,
          branchId: inv.branchId,
          invoiceId,
          number,
          method: input.method,
          amount,
          reference: input.reference,
          idempotencyKey: input.idempotencyKey,
          journalId: journal.id,
          receivedBy: p.userId,
        },
      });
      await this.event(
        tx,
        { id: inv.jobId, companyId: scope.companyId },
        p.userId,
        'payment_received',
        `${number} · ${money(amount)} ${inv.currency} · ${input.method}`,
      );
      await writeAudit(tx, ctx, {
        action: 'billing.payment.record',
        entityType: 'payment',
        entityId: id,
        companyId: scope.companyId,
        branchId: inv.branchId,
        after: {
          number,
          invoice: inv.number,
          method: input.method,
          amount: money(amount),
          reference: input.reference,
        },
      });
      return inv.jobId;
    });
    return this.jobBilling(scope, p, jobId);
  }

  async creditNote(
    scope: CompanyScope,
    p: Principal,
    invoiceId: string,
    input: CreditNoteInput,
    ctx: AuditContext,
  ) {
    const jobId = await this.prisma.$transaction(async (tx) => {
      const inv = await this.liveInvoice(tx, scope, invoiceId);
      await this.mustBill(p, scope.companyId, inv.branchId);
      if (inv.payments.length) throw conflict('This invoice has payments; refunds are not supported yet');
      const original = await tx.journalLine.findMany({
        where: { journalId: inv.journalId },
        orderBy: { lineNo: 'asc' },
      });
      const company = await tx.company.findUniqueOrThrow({ where: { id: scope.companyId } });
      const today = localTime(new Date(), company.timezone).date;
      const year = today.slice(0, 4);
      const number = formatDocumentNumber(
        'CN',
        year,
        await nextDocumentNumber(tx, scope.companyId, 'credit_note', year),
      );
      const journal = await postSystemJournal(
        tx,
        { ...ctx, actorUserId: p.userId },
        {
          companyId: scope.companyId,
          branchId: inv.branchId,
          postingDate: today,
          description: `${number} cancels ${inv.number} · ${input.reason}`,
          currency: inv.currency,
          sourceType: 'reversal',
          sourceId: inv.journalId,
          reversalOfId: inv.journalId,
          lines: reversedLines(
            original.map((l) => ({
              accountId: l.accountId,
              debit: new Prisma.Decimal(l.debit),
              credit: new Prisma.Decimal(l.credit),
              description: null,
            })),
            number,
          ),
        },
      );
      const cn = await tx.invoice.create({
        data: {
          companyId: scope.companyId,
          branchId: inv.branchId,
          jobId: inv.jobId,
          quoteId: inv.quoteId,
          kind: 'credit_note',
          number,
          invoiceDate: new Date(`${today}T00:00:00Z`),
          currency: inv.currency,
          customerId: inv.customerId,
          customerName: inv.customerName,
          subtotal: inv.subtotal,
          discountAmount: inv.discountAmount,
          netAmount: inv.netAmount,
          taxAmount: inv.taxAmount,
          total: inv.total,
          taxCode: inv.taxCode,
          taxPct: inv.taxPct,
          pricesIncludeTax: inv.pricesIncludeTax,
          journalId: journal.id,
          creditOfId: inv.id,
          reason: input.reason,
          createdBy: p.userId,
          lines: {
            create: inv.lines.map((l) => ({
              lineNo: l.lineNo,
              kind: l.kind,
              description: l.description,
              hours: l.hours,
              rate: l.rate,
              amount: l.amount,
            })),
          },
        },
      });
      // After the credit note exists (its check needs the invoice still live).
      await tx.invoice.update({ where: { id: inv.id }, data: { credited: true } });
      await this.event(
        tx,
        { id: inv.jobId, companyId: scope.companyId },
        p.userId,
        'credit_note_posted',
        `${number} · ${inv.number} · ${input.reason}`,
      );
      await writeAudit(tx, ctx, {
        action: 'billing.credit_note.post',
        entityType: 'invoice',
        entityId: cn.id,
        companyId: scope.companyId,
        branchId: inv.branchId,
        reason: input.reason,
        after: { number, cancels: inv.number, journal: journal.number },
      });
      return inv.jobId;
    });
    return this.jobBilling(scope, p, jobId);
  }

  async releaseUnpaid(
    scope: CompanyScope,
    p: Principal,
    jobId: string,
    input: ReleaseUnpaidInput,
    ctx: AuditContext,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const job = await this.job(tx, scope, jobId, true);
      if (!(await this.can(p, scope.companyId, 'workshop.pricing.manage', job.branchId)))
        throw forbidden('Only the owner (pricing permission) lets a car leave unpaid');
      if (job.status !== 'ready') throw conflict('Only a job that is ready can be released');
      if (job.unpaidReleaseBy) throw conflict('This car is already released');
      const n = await tx.jobCard.updateMany({
        where: { id: jobId, version: input.version },
        data: {
          version: { increment: 1 },
          unpaidReleaseBy: p.userId,
          unpaidReleaseAt: new Date(),
          unpaidReleaseReason: input.reason,
        },
      });
      if (n.count === 0) throw conflict('This job was changed by someone else; reload and try again');
      await this.event(tx, job, p.userId, 'unpaid_release', input.reason);
      await writeAudit(tx, ctx, {
        action: 'billing.unpaid_release',
        entityType: 'job_card',
        entityId: jobId,
        companyId: scope.companyId,
        branchId: job.branchId,
        reason: input.reason,
      });
    });
    return this.jobBilling(scope, p, jobId);
  }

  async invoice(scope: CompanyScope, p: Principal, invoiceId: string): Promise<InvoiceDto> {
    const d = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, companyId: scope.companyId },
      include: invoiceInclude,
    });
    if (!d || (!scope.allBranches && !scope.branchIds.includes(d.branchId))) throw notFound('Invoice');
    const names = await this.names([d.createdBy, ...d.payments.map((x) => x.receivedBy)]);
    const journals = await this.prisma.journal.findMany({
      where: { id: { in: [d.journalId, ...d.payments.map((x) => x.journalId)] } },
      select: { id: true, number: true },
    });
    return this.toDto(
      d,
      names,
      (id) => journals.find((j) => j.id === id)?.number ?? '—',
      await this.can(p, scope.companyId, 'billing.invoice.manage', d.branchId),
    );
  }
}
