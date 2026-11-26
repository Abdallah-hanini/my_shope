import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CancelSupplierBillInput,
  CreateSupplierBillInput,
  CreateSupplierInput,
  SupplierBillListQuery,
  SupplierPaymentInput,
  UpdateSupplierInput,
} from '@erp/validation';
import { postSystemJournal } from '../accounting/posting';
import type { CompanyScope, Principal } from '../auth/principal';
import { AuthzService } from '../authz/authz.service';
import { resolveScope } from '../authz/scope';
import { reversedLines } from '../billing/billing-math';
import { conflict, forbidden, notFound, unprocessable } from '../common/errors';
import { PrismaService } from '../infra/prisma.service';
import { writeAudit, type AuditContext } from '../platform/audit';
import { formatDocumentNumber, nextDocumentNumber } from '../platform/sequence';
import { effectiveOn, isoDate } from '../settings/effective';
import { localTime } from '../workshop/scheduling';
import type {
  SupplierBillDto,
  SupplierBillListDto,
  SupplierBillSummaryDto,
  SupplierDetailDto,
  SupplierDto,
  SupplierListDto,
  UnbilledReceiptsDto,
} from './purchasing.dto';
import { billJournalLines, billTotals, dueDate, supplierPaymentLines } from './purchasing-math';

type Tx = Prisma.TransactionClient;
const D = Prisma.Decimal;
const money = (d: Prisma.Decimal) => d.toFixed(2);
const unique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
const billInclude = {
  supplier: { select: { name: true } },
  branch: { select: { code: true } },
  payments: { orderBy: { paidAt: 'asc' } },
  lines: {
    orderBy: { lineNo: 'asc' },
    include: { movement: { include: { part: { select: { sku: true, name: true } } } } },
  },
} satisfies Prisma.SupplierBillInclude;
type BillRow = Prisma.SupplierBillGetPayload<{ include: typeof billInclude }>;
type BillHead = {
  id: string;
  number: string;
  supplierId: string;
  supplierInvoiceNo: string;
  billDate: Date;
  dueDate: Date;
  currency: string;
  total: Prisma.Decimal;
  cancelled: boolean;
  supplier: { name: string };
  branch: { code: string };
  payments: { amount: Prisma.Decimal }[];
};

/**
 * Suppliers, supplier bills and supplier payments (T-76). A bill is a supplier's invoice matched to
 * stock receipts not yet billed; it posts Dr goods received not invoiced (the receipts' value),
 * Dr/Cr price variance (any difference, with a reason), Dr recoverable input tax, Cr payables. Each
 * receipt is billed once (database). Payments (cash or bank transfer) never exceed what is owed,
 * and the person who entered a bill does not pay it (the owner may). An unpaid bill is cancelled by
 * reversing its journal; its receipts can then be billed again. Posted documents never change.
 */
@Injectable()
export class PurchasingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthzService,
  ) {}

  private async scopeFor(p: Principal, companyId: string, permission: string) {
    return resolveScope(companyId, permission, await this.authz.grants(p.userId, companyId));
  }
  private async can(p: Principal, companyId: string, permission: string, branchId?: string) {
    const s = await this.scopeFor(p, companyId, permission);
    return !!s && (branchId ? s.allBranches || s.branchIds.includes(branchId) : s.allBranches);
  }
  private branchWhere(scope: CompanyScope) {
    return scope.allBranches ? {} : { branchId: { in: scope.branchIds } };
  }
  private async today(db: Tx | PrismaService, companyId: string) {
    const c = await db.company.findUniqueOrThrow({ where: { id: companyId } });
    return { date: localTime(new Date(), c.timezone).date, currency: c.baseCurrency };
  }
  private async names(ids: (string | null)[]) {
    const u = [...new Set(ids.filter((x): x is string => !!x))];
    const rows = u.length
      ? await this.prisma.user.findMany({ where: { id: { in: u } }, select: { id: true, displayName: true } })
      : [];
    return new Map(rows.map((r) => [r.id, r.displayName]));
  }

  // ── suppliers ──────────────────────────────────────────────────────────────

  private async balances(scope: CompanyScope, supplierIds: string[], today: string) {
    const bills = await this.prisma.supplierBill.findMany({
      where: {
        companyId: scope.companyId,
        supplierId: { in: supplierIds },
        cancelled: false,
        ...this.branchWhere(scope),
      },
      select: { supplierId: true, total: true, dueDate: true, payments: { select: { amount: true } } },
    });
    const out = new Map<string, { balance: Prisma.Decimal; overdue: Prisma.Decimal }>();
    for (const b of bills) {
      const owed = b.payments.reduce((s, x) => s.minus(x.amount), b.total);
      const cur = out.get(b.supplierId) ?? { balance: new D(0), overdue: new D(0) };
      cur.balance = cur.balance.plus(owed);
      if (isoDate(b.dueDate) < today) cur.overdue = cur.overdue.plus(owed);
      out.set(b.supplierId, cur);
    }
    return out;
  }

  private supplierDto(
    s: Prisma.SupplierGetPayload<object>,
    bal?: { balance: Prisma.Decimal; overdue: Prisma.Decimal },
  ): SupplierDto {
    return {
      id: s.id,
      name: s.name,
      nameAr: s.nameAr,
      phone: s.phone,
      email: s.email,
      taxNumber: s.taxNumber,
      paymentTermsDays: s.paymentTermsDays,
      active: s.active,
      version: s.version,
      balance: money(bal?.balance ?? new D(0)),
      overdue: money(bal?.overdue ?? new D(0)),
    };
  }

  async listSuppliers(scope: CompanyScope, p: Principal): Promise<SupplierListDto> {
    const rows = await this.prisma.supplier.findMany({
      where: { companyId: scope.companyId },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
    const { date } = await this.today(this.prisma, scope.companyId);
    const bal = await this.balances(
      scope,
      rows.map((r) => r.id),
      date,
    );
    return {
      suppliers: rows.map((r) => this.supplierDto(r, bal.get(r.id))),
      canManage: await this.can(p, scope.companyId, 'purchasing.manage'),
    };
  }

  async getSupplier(scope: CompanyScope, p: Principal, supplierId: string): Promise<SupplierDetailDto> {
    const s = await this.prisma.supplier.findUnique({
      where: { companyId_id: { companyId: scope.companyId, id: supplierId } },
    });
    if (!s) throw notFound('Supplier');
    const { date } = await this.today(this.prisma, scope.companyId);
    const [bal, bills, manage] = await Promise.all([
      this.balances(scope, [s.id], date),
      this.prisma.supplierBill.findMany({
        where: { companyId: scope.companyId, supplierId, ...this.branchWhere(scope) },
        include: { supplier: { select: { name: true } }, branch: { select: { code: true } }, payments: true },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      this.scopeFor(p, scope.companyId, 'purchasing.manage'),
    ]);
    const branches = await this.prisma.branch.findMany({
      where: {
        companyId: scope.companyId,
        status: 'active',
        ...(scope.allBranches ? {} : { id: { in: scope.branchIds } }),
      },
      orderBy: { code: 'asc' },
    });
    return {
      ...this.supplierDto(s, bal.get(s.id)),
      bills: bills.map((b) => this.summary(b, date)),
      canManage: !!manage?.allBranches,
      billBranches: s.active
        ? branches
            .filter((b) => !!manage && (manage.allBranches || manage.branchIds.includes(b.id)))
            .map((b) => ({ id: b.id, code: b.code }))
        : [],
    };
  }

  private async mustManageSuppliers(p: Principal, companyId: string) {
    if (!(await this.can(p, companyId, 'purchasing.manage')))
      throw forbidden('Only purchasing managers for the whole company add or change suppliers');
  }

  async createSupplier(scope: CompanyScope, p: Principal, input: CreateSupplierInput, ctx: AuditContext) {
    await this.mustManageSuppliers(p, scope.companyId);
    try {
      const id = await this.prisma.$transaction(async (tx) => {
        const s = await tx.supplier.create({ data: { companyId: scope.companyId, ...input } });
        await writeAudit(tx, ctx, {
          action: 'purchasing.supplier.create',
          entityType: 'supplier',
          entityId: s.id,
          companyId: scope.companyId,
          after: input,
        });
        return s.id;
      });
      return this.getSupplier(scope, p, id);
    } catch (e) {
      if (unique(e)) throw conflict(`Supplier ${input.name} already exists`);
      throw e;
    }
  }

  async updateSupplier(
    scope: CompanyScope,
    p: Principal,
    supplierId: string,
    input: UpdateSupplierInput,
    ctx: AuditContext,
  ) {
    await this.mustManageSuppliers(p, scope.companyId);
    const { version, ...data } = input;
    try {
      await this.prisma.$transaction(async (tx) => {
        const n = await tx.supplier.updateMany({
          where: { id: supplierId, companyId: scope.companyId, version },
          data: { ...data, version: { increment: 1 } },
        });
        if (n.count === 0) {
          if (!(await tx.supplier.findFirst({ where: { id: supplierId, companyId: scope.companyId } })))
            throw notFound('Supplier');
          throw conflict('This supplier was changed by someone else; reload and try again');
        }
        await writeAudit(tx, ctx, {
          action: 'purchasing.supplier.update',
          entityType: 'supplier',
          entityId: supplierId,
          companyId: scope.companyId,
          after: data,
        });
      });
    } catch (e) {
      if (unique(e)) throw conflict(`Supplier ${input.name} already exists`);
      throw e;
    }
    return this.getSupplier(scope, p, supplierId);
  }

  /** Receipts at a branch not yet on a live bill, from this supplier or recorded without one. */
  async unbilledReceipts(
    scope: CompanyScope,
    supplierId: string,
    branchId: string,
  ): Promise<UnbilledReceiptsDto> {
    if (!scope.allBranches && !scope.branchIds.includes(branchId)) throw notFound('Branch');
    const s = await this.prisma.supplier.findUnique({
      where: { companyId_id: { companyId: scope.companyId, id: supplierId } },
    });
    if (!s) throw notFound('Supplier');
    const [rows, codes, tax] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where: {
          companyId: scope.companyId,
          branchId,
          kind: 'receipt',
          OR: [{ supplierId }, { supplierId: null }],
          billLines: { none: { live: true } },
        },
        include: { part: { select: { sku: true, name: true } } },
        orderBy: { createdAt: 'asc' },
        take: 500,
      }),
      this.prisma.taxCode.findMany({
        where: { companyId: scope.companyId, active: true },
        orderBy: { code: 'asc' },
      }),
      this.prisma.taxSettings.findUnique({ where: { companyId: scope.companyId } }),
    ]);
    return {
      branchId,
      receipts: rows.map((m) => ({
        movementId: m.id,
        number: m.number,
        sku: m.part.sku,
        partName: m.part.name,
        quantity: m.quantity.toFixed(3),
        unitCost: m.unitCost.toFixed(4),
        value: money(m.value),
        reference: m.reference,
        fromThisSupplier: m.supplierId === supplierId,
        receivedAt: m.createdAt.toISOString(),
      })),
      taxCodes: codes.map((c) => ({ id: c.id, code: c.code, name: c.name })),
      defaultTaxCodeId: tax?.defaultTaxCodeId ?? null,
    };
  }

  // ── bills ──────────────────────────────────────────────────────────────────

  private summary(b: BillHead, today: string): SupplierBillSummaryDto {
    const paid = b.payments.reduce((s, x) => s.plus(x.amount), new D(0));
    const balance = b.cancelled ? new D(0) : b.total.minus(paid);
    const status = b.cancelled ? 'cancelled' : balance.isZero() ? 'paid' : 'open';
    return {
      id: b.id,
      number: b.number,
      supplierId: b.supplierId,
      supplierName: b.supplier.name,
      branchCode: b.branch.code,
      supplierInvoiceNo: b.supplierInvoiceNo,
      billDate: isoDate(b.billDate),
      dueDate: isoDate(b.dueDate),
      currency: b.currency,
      total: money(b.total),
      paid: money(paid),
      balance: money(balance),
      status,
      overdue: status === 'open' && isoDate(b.dueDate) < today,
    };
  }

  async listBills(scope: CompanyScope, q: SupplierBillListQuery): Promise<SupplierBillListDto> {
    const { date, currency } = await this.today(this.prisma, scope.companyId);
    const where = this.branchWhere(scope);
    const asOf = new Date();
    const data = await this.prisma.$transaction(
      async (tx) => {
        const bills = await tx.supplierBill.findMany({
          where: {
            companyId: scope.companyId,
            ...where,
            ...(q.supplierId ? { supplierId: q.supplierId } : {}),
          },
          include: {
            supplier: { select: { name: true } },
            branch: { select: { code: true } },
            payments: true,
          },
          orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
          take: 1000,
        });
        const open = await tx.supplierBill.findMany({
          where: { companyId: scope.companyId, cancelled: false, ...where },
          select: { total: true, payments: { select: { amount: true } } },
        });
        const unbilled = await tx.stockMovement.aggregate({
          where: {
            companyId: scope.companyId,
            kind: 'receipt',
            billLines: { none: { live: true } },
            ...where,
          },
          _sum: { value: true },
        });
        const settings = await tx.postingSettings.findUnique({ where: { companyId: scope.companyId } });
        const ledger = async (accountId: string | null | undefined) => {
          if (!accountId) return null;
          const a = await tx.journalLine.aggregate({
            where: { companyId: scope.companyId, accountId, ...where },
            _sum: { debit: true, credit: true },
          });
          return new D(a._sum.credit ?? 0).minus(a._sum.debit ?? 0);
        };
        return {
          bills,
          openBills: open.reduce(
            (s, b) => s.plus(b.payments.reduce((t, x) => t.minus(x.amount), b.total)),
            new D(0),
          ),
          unbilled: new D(unbilled._sum.value ?? 0),
          payables: await ledger(settings?.payablesAccountId),
          grni: await ledger(settings?.goodsReceivedAccountId),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    const list = data.bills
      .map((b) => this.summary(b, date))
      .filter((b) => q.status === 'all' || b.status === 'open');
    return {
      bills: list,
      currency,
      reconciliation: {
        openBills: money(data.openBills),
        payablesLedger: data.payables ? money(data.payables) : null,
        unbilledReceipts: money(data.unbilled),
        goodsReceivedLedger: data.grni ? money(data.grni) : null,
        reconciled:
          !!data.payables &&
          !!data.grni &&
          data.payables.equals(data.openBills) &&
          data.grni.equals(data.unbilled),
        asOf: asOf.toISOString(),
      },
    };
  }

  async getBill(scope: CompanyScope, p: Principal, billId: string): Promise<SupplierBillDto> {
    const b = await this.prisma.supplierBill.findFirst({
      where: { id: billId, companyId: scope.companyId },
      include: billInclude,
    });
    if (!b || (!scope.allBranches && !scope.branchIds.includes(b.branchId))) throw notFound('Supplier bill');
    return this.billDto(scope, p, b);
  }

  private async billDto(scope: CompanyScope, p: Principal, b: BillRow): Promise<SupplierBillDto> {
    const { date } = await this.today(this.prisma, scope.companyId);
    const [names, journals, manage, pay, owner] = await Promise.all([
      this.names([b.createdBy, b.cancelledBy, ...b.payments.map((x) => x.paidBy)]),
      this.prisma.journal.findMany({
        where: {
          id: {
            in: [
              b.journalId,
              ...(b.cancelJournalId ? [b.cancelJournalId] : []),
              ...b.payments.map((x) => x.journalId),
            ],
          },
        },
        select: { id: true, number: true },
      }),
      this.can(p, scope.companyId, 'purchasing.manage', b.branchId),
      this.can(p, scope.companyId, 'purchasing.pay', b.branchId),
      this.can(p, scope.companyId, 'workshop.pricing.manage', b.branchId),
    ]);
    const jn = (id: string | null) => (id ? (journals.find((j) => j.id === id)?.number ?? '—') : null);
    const s = this.summary(b, date);
    const actions: string[] = [];
    let payBlockedReason: string | null = null;
    if (s.status === 'open' && pay) {
      if (b.createdBy === p.userId && !owner)
        payBlockedReason = 'You entered this bill; someone else (or the owner) pays it';
      else actions.push('pay');
    }
    if (s.status === 'open' && manage && !b.payments.length) actions.push('cancel');
    return {
      ...s,
      receiptsValue: money(b.receiptsValue),
      netAmount: money(b.netAmount),
      varianceAmount: money(b.varianceAmount),
      varianceReason: b.varianceReason,
      taxCode: b.taxCode,
      taxPct: b.taxPct ? b.taxPct.toFixed(4) : null,
      taxAmount: money(b.taxAmount),
      journalNumber: jn(b.journalId)!,
      cancelJournalNumber: jn(b.cancelJournalId),
      cancelReason: b.cancelReason,
      cancelledByName: b.cancelledBy ? (names.get(b.cancelledBy) ?? '—') : null,
      createdByName: names.get(b.createdBy) ?? '—',
      createdAt: b.createdAt.toISOString(),
      lines: b.lines.map((l) => ({
        lineNo: l.lineNo,
        movementId: l.movementId,
        movementNumber: l.movement.number,
        sku: l.movement.part.sku,
        partName: l.movement.part.name,
        quantity: l.movement.quantity.toFixed(3),
        reference: l.movement.reference,
        receiptValue: money(l.receiptValue),
        amount: money(l.amount),
      })),
      payments: b.payments.map((x) => ({
        id: x.id,
        number: x.number,
        method: x.method,
        amount: money(x.amount),
        reference: x.reference,
        paidByName: names.get(x.paidBy) ?? '—',
        paidAt: x.paidAt.toISOString(),
        journalNumber: jn(x.journalId)!,
      })),
      actions,
      payBlockedReason,
    };
  }

  async createBill(scope: CompanyScope, p: Principal, input: CreateSupplierBillInput, ctx: AuditContext) {
    const existing = await this.prisma.supplierBill.findUnique({
      where: {
        companyId_idempotencyKey: { companyId: scope.companyId, idempotencyKey: input.idempotencyKey },
      },
    });
    if (existing) {
      if (existing.supplierId !== input.supplierId)
        throw conflict('This form was already used for another bill');
      return this.getBill(scope, p, existing.id);
    }
    if (!scope.allBranches && !scope.branchIds.includes(input.branchId)) throw notFound('Branch');
    if (!(await this.can(p, scope.companyId, 'purchasing.manage', input.branchId)))
      throw forbidden('Only purchasing managers enter supplier bills');
    let id: string;
    try {
      id = await this.prisma.$transaction(async (tx) => {
        const supplier = await tx.supplier.findUnique({
          where: { companyId_id: { companyId: scope.companyId, id: input.supplierId } },
        });
        if (!supplier) throw notFound('Supplier');
        if (!supplier.active) throw unprocessable(`Supplier ${supplier.name} is inactive`);
        const branch = await tx.branch.findUnique({
          where: { companyId_id: { companyId: scope.companyId, id: input.branchId } },
        });
        if (!branch) throw notFound('Branch');
        const { date: today, currency } = await this.today(tx, scope.companyId);
        if (input.billDate > today)
          throw unprocessable('The supplier’s invoice date cannot be in the future');
        const dupe = await tx.supplierBill.findFirst({
          where: {
            supplierId: supplier.id,
            cancelled: false,
            supplierInvoiceNo: { equals: input.supplierInvoiceNo, mode: 'insensitive' },
          },
        });
        if (dupe)
          throw conflict(
            `Invoice ${input.supplierInvoiceNo} of ${supplier.name} is already entered (${dupe.number})`,
          );

        // Lock the receipts so two bills cannot take the same one at once.
        const ids = input.lines.map((l) => l.movementId);
        await tx.$queryRaw`SELECT 1 FROM inventory.stock_movement WHERE id = ANY(${ids}::uuid[]) FOR UPDATE`;
        const moves = await tx.stockMovement.findMany({
          where: { id: { in: ids }, companyId: scope.companyId },
          include: { billLines: { where: { live: true } }, part: { select: { sku: true } } },
        });
        const lines = input.lines.map((l, i) => {
          const m = moves.find((x) => x.id === l.movementId);
          if (!m || m.kind !== 'receipt' || m.branchId !== branch.id) throw notFound('Stock receipt');
          if (m.supplierId && m.supplierId !== supplier.id)
            throw unprocessable(`Receipt ${m.number} came from another supplier`);
          if (m.billLines.length) throw conflict(`Receipt ${m.number} is already on a bill`);
          return {
            lineNo: i + 1,
            companyId: scope.companyId,
            movementId: m.id,
            receiptValue: m.value,
            amount: new D(l.amount),
          };
        });

        let tax: { code: string; pct: Prisma.Decimal } | null = null;
        if (input.taxCodeId) {
          const code = await tx.taxCode.findUnique({
            where: { companyId_id: { companyId: scope.companyId, id: input.taxCodeId } },
            include: { rates: true },
          });
          if (!code || !code.active) throw notFound('Tax code');
          const rate = effectiveOn(
            code.rates.map((r) => ({ ...r, effectiveFrom: isoDate(r.effectiveFrom) })),
            input.billDate,
          );
          if (!rate)
            throw unprocessable(
              `Tax ${code.code} has no rate on ${input.billDate}; the accountant must add one`,
            );
          tax = { code: code.code, pct: rate.ratePct };
        }
        const t = billTotals(lines, tax?.pct ?? null);
        if (!t.varianceAmount.isZero() && !input.varianceReason)
          throw unprocessable(
            `The bill is ${money(t.varianceAmount.abs())} ${t.varianceAmount.greaterThan(0) ? 'more' : 'less'} than the receipts' value; give the reason for the difference`,
          );
        const settings = await tx.postingSettings.findUnique({ where: { companyId: scope.companyId } });
        if (!settings?.goodsReceivedAccountId || !settings.payablesAccountId)
          throw unprocessable(
            'The accountant must choose the goods received and supplier payables accounts first (Posting accounts)',
          );
        if (!t.varianceAmount.isZero() && !settings.priceVarianceAccountId)
          throw unprocessable(
            'The accountant must choose the purchase price difference account first (Posting accounts)',
          );
        if (t.taxAmount.greaterThan(0) && !settings.inputTaxAccountId)
          throw unprocessable(
            'The accountant must choose the recoverable input tax account first (Posting accounts)',
          );

        const year = today.slice(0, 4);
        const number = formatDocumentNumber(
          'PB',
          year,
          await nextDocumentNumber(tx, scope.companyId, 'supplier_bill', year),
        );
        const billId = (await tx.$queryRaw<{ id: string }[]>`SELECT gen_random_uuid()::text AS id`)[0]!.id;
        const journal = await postSystemJournal(
          tx,
          { ...ctx, actorUserId: p.userId },
          {
            companyId: scope.companyId,
            branchId: branch.id,
            postingDate: today,
            description: `${number} · ${supplier.name} · ${input.supplierInvoiceNo}`,
            currency,
            sourceType: 'supplier_bill',
            sourceId: billId,
            lines: billJournalLines(
              t,
              {
                goodsReceived: settings.goodsReceivedAccountId,
                payables: settings.payablesAccountId,
                inputTax: settings.inputTaxAccountId,
                priceVariance: settings.priceVarianceAccountId,
              },
              number,
            ),
          },
        );
        await tx.supplierBill.create({
          data: {
            id: billId,
            companyId: scope.companyId,
            branchId: branch.id,
            supplierId: supplier.id,
            number,
            supplierInvoiceNo: input.supplierInvoiceNo,
            billDate: new Date(`${input.billDate}T00:00:00Z`),
            dueDate: new Date(`${dueDate(input.billDate, supplier.paymentTermsDays)}T00:00:00Z`),
            currency,
            receiptsValue: t.receiptsValue,
            netAmount: t.netAmount,
            varianceAmount: t.varianceAmount,
            varianceReason: t.varianceAmount.isZero() ? null : input.varianceReason,
            taxCode: tax?.code ?? null,
            taxPct: tax?.pct ?? null,
            taxAmount: t.taxAmount,
            total: t.total,
            idempotencyKey: input.idempotencyKey,
            journalId: journal.id,
            createdBy: p.userId,
          },
        });
        await tx.supplierBillLine.createMany({ data: lines.map((l) => ({ ...l, billId })) });
        await writeAudit(tx, ctx, {
          action: 'purchasing.bill.post',
          entityType: 'supplier_bill',
          entityId: billId,
          companyId: scope.companyId,
          branchId: branch.id,
          reason: t.varianceAmount.isZero() ? undefined : (input.varianceReason ?? undefined),
          after: {
            number,
            supplier: supplier.name,
            invoice: input.supplierInvoiceNo,
            receipts: moves.map((m) => m.number),
            total: money(t.total),
            journal: journal.number,
          },
        });
        return billId;
      });
    } catch (e) {
      if (unique(e)) {
        const again = await this.prisma.supplierBill.findUnique({
          where: {
            companyId_idempotencyKey: { companyId: scope.companyId, idempotencyKey: input.idempotencyKey },
          },
        });
        if (again) return this.getBill(scope, p, again.id); // the same form, submitted twice at once
        throw conflict(
          'A receipt or this supplier invoice number is already on another bill; reload and try again',
        );
      }
      throw e;
    }
    return this.getBill(scope, p, id);
  }

  private async lockBill(tx: Tx, scope: CompanyScope, billId: string) {
    await tx.$queryRaw`SELECT 1 FROM purchasing.supplier_bill WHERE id = ${billId}::uuid FOR UPDATE`;
    const b = await tx.supplierBill.findFirst({
      where: { id: billId, companyId: scope.companyId },
      include: { payments: true, supplier: { select: { name: true } } },
    });
    if (!b || (!scope.allBranches && !scope.branchIds.includes(b.branchId))) throw notFound('Supplier bill');
    if (b.cancelled) throw conflict('This bill is cancelled');
    return b;
  }

  async pay(
    scope: CompanyScope,
    p: Principal,
    billId: string,
    input: SupplierPaymentInput,
    ctx: AuditContext,
  ) {
    const existing = await this.prisma.supplierPayment.findUnique({
      where: {
        companyId_idempotencyKey: { companyId: scope.companyId, idempotencyKey: input.idempotencyKey },
      },
    });
    if (existing) {
      if (existing.billId !== billId || !existing.amount.equals(input.amount))
        throw conflict('This payment form was already used for a different payment');
      return this.getBill(scope, p, billId);
    }
    try {
      await this.prisma.$transaction(async (tx) => {
        const b = await this.lockBill(tx, scope, billId);
        if (!(await this.can(p, scope.companyId, 'purchasing.pay', b.branchId)))
          throw forbidden('Only people allowed to pay suppliers record supplier payments');
        if (
          b.createdBy === p.userId &&
          !(await this.can(p, scope.companyId, 'workshop.pricing.manage', b.branchId))
        )
          throw forbidden('You entered this bill; someone else (or the owner) pays it');
        const owed = b.payments.reduce((s, x) => s.minus(x.amount), b.total);
        const amount = new D(input.amount);
        if (amount.greaterThan(owed))
          throw unprocessable(`The amount is more than the ${money(owed)} still owed`);
        const settings = await tx.postingSettings.findUnique({ where: { companyId: scope.companyId } });
        const moneyAccount = input.method === 'cash' ? settings?.cashAccountId : settings?.bankAccountId;
        if (!moneyAccount || !settings?.payablesAccountId)
          throw unprocessable(
            `The accountant must choose the ${input.method} and supplier payables accounts first (Posting accounts)`,
          );
        const { date: today } = await this.today(tx, scope.companyId);
        const year = today.slice(0, 4);
        const number = formatDocumentNumber(
          'PV',
          year,
          await nextDocumentNumber(tx, scope.companyId, 'supplier_payment', year),
        );
        const id = (await tx.$queryRaw<{ id: string }[]>`SELECT gen_random_uuid()::text AS id`)[0]!.id;
        const journal = await postSystemJournal(
          tx,
          { ...ctx, actorUserId: p.userId },
          {
            companyId: scope.companyId,
            branchId: b.branchId,
            postingDate: today,
            description: `${number} · ${b.number} · ${b.supplier.name} · ${input.method}${input.reference ? ` ${input.reference}` : ''}`,
            currency: b.currency,
            sourceType: 'supplier_payment',
            sourceId: id,
            lines: supplierPaymentLines(
              amount,
              { payables: settings.payablesAccountId, money: moneyAccount },
              number,
            ),
          },
        );
        await tx.supplierPayment.create({
          data: {
            id,
            companyId: scope.companyId,
            branchId: b.branchId,
            billId,
            number,
            method: input.method,
            amount,
            reference: input.reference,
            idempotencyKey: input.idempotencyKey,
            journalId: journal.id,
            paidBy: p.userId,
          },
        });
        await writeAudit(tx, ctx, {
          action: 'purchasing.payment.record',
          entityType: 'supplier_payment',
          entityId: id,
          companyId: scope.companyId,
          branchId: b.branchId,
          after: {
            number,
            bill: b.number,
            method: input.method,
            amount: money(amount),
            reference: input.reference,
          },
        });
      });
    } catch (e) {
      if (unique(e)) return this.getBill(scope, p, billId);
      throw e;
    }
    return this.getBill(scope, p, billId);
  }

  async cancel(
    scope: CompanyScope,
    p: Principal,
    billId: string,
    input: CancelSupplierBillInput,
    ctx: AuditContext,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const b = await this.lockBill(tx, scope, billId);
      if (!(await this.can(p, scope.companyId, 'purchasing.manage', b.branchId)))
        throw forbidden('Only purchasing managers cancel supplier bills');
      if (b.payments.length) throw conflict('This bill has payments; it can no longer be cancelled');
      const original = await tx.journalLine.findMany({
        where: { journalId: b.journalId },
        orderBy: { lineNo: 'asc' },
      });
      const { date: today } = await this.today(tx, scope.companyId);
      const label = `${b.number} cancelled`;
      const journal = await postSystemJournal(
        tx,
        { ...ctx, actorUserId: p.userId },
        {
          companyId: scope.companyId,
          branchId: b.branchId,
          postingDate: today,
          description: `${label} · ${input.reason}`,
          currency: b.currency,
          sourceType: 'reversal',
          sourceId: b.journalId,
          reversalOfId: b.journalId,
          lines: reversedLines(
            original.map((l) => ({
              accountId: l.accountId,
              debit: new D(l.debit),
              credit: new D(l.credit),
              description: null,
            })),
            label,
          ),
        },
      );
      await tx.supplierBill.update({
        where: { id: b.id },
        data: {
          cancelled: true,
          cancelJournalId: journal.id,
          cancelReason: input.reason,
          cancelledBy: p.userId,
          cancelledAt: new Date(),
        },
      });
      // Free the receipts for another bill (after the bill is marked cancelled; the database checks).
      await tx.supplierBillLine.updateMany({ where: { billId: b.id }, data: { live: false } });
      await writeAudit(tx, ctx, {
        action: 'purchasing.bill.cancel',
        entityType: 'supplier_bill',
        entityId: b.id,
        companyId: scope.companyId,
        branchId: b.branchId,
        reason: input.reason,
        after: { number: b.number, journal: journal.number },
      });
    });
    return this.getBill(scope, p, billId);
  }
}
