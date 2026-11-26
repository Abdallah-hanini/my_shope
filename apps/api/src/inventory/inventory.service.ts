import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  AdjustStockInput,
  CreatePartInput,
  PartListQuery,
  ReceiveStockInput,
  UpdatePartInput,
} from '@erp/validation';
import { postSystemJournal } from '../accounting/posting';
import type { CompanyScope, Principal } from '../auth/principal';
import { AuthzService } from '../authz/authz.service';
import { resolveScope } from '../authz/scope';
import { conflict, forbidden, notFound, unprocessable } from '../common/errors';
import { PrismaService } from '../infra/prisma.service';
import { writeAudit, type AuditContext } from '../platform/audit';
import { formatDocumentNumber, nextDocumentNumber } from '../platform/sequence';
import { localTime } from '../workshop/scheduling';
import type { PartDto, PartListDto, PartListItemDto, ValuationDto } from './inventory.dto';
import { averageCost, stockIn, stockOut, type StockLevel } from './stock-math';

const D = Prisma.Decimal;
const qty = (d: Prisma.Decimal) => d.toFixed(3);
const money = (d: Prisma.Decimal) => d.toFixed(2);
const unique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

/**
 * Parts catalogue and stock per branch at weighted average cost (D-06, T-74). Every stock change
 * is a numbered movement posted to the ledger in the same transaction (receipt: Dr inventory,
 * Cr goods received not invoiced; counted differences against stock adjustments), with the stock
 * row locked; stock never goes negative. The database refuses balance changes without a movement.
 */
@Injectable()
export class InventoryService {
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
  private branchWhere(scope: CompanyScope, branchId?: string) {
    if (branchId) {
      if (!scope.allBranches && !scope.branchIds.includes(branchId)) throw notFound('Branch');
      return { branchId };
    }
    return scope.allBranches ? {} : { branchId: { in: scope.branchIds } };
  }

  async list(scope: CompanyScope, p: Principal, q: PartListQuery): Promise<PartListDto> {
    const where = this.branchWhere(scope, q.branchId);
    const term = q.q?.trim();
    const parts = await this.prisma.part.findMany({
      where: {
        companyId: scope.companyId,
        ...(q.includeInactive === 'true' ? {} : { active: true }),
        ...(term
          ? {
              OR: [
                { sku: { contains: term, mode: 'insensitive' } },
                { name: { contains: term, mode: 'insensitive' } },
                { nameAr: { contains: term } },
                { brand: { contains: term, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: { stock: { where } },
      orderBy: { sku: 'asc' },
      take: 500,
    });
    return {
      parts: parts.map((x) => this.item(x, x.stock)),
      canCreate: await this.can(p, scope.companyId, 'inventory.manage'),
    };
  }

  private item(
    x: {
      id: string;
      sku: string;
      name: string;
      nameAr: string | null;
      brand: string | null;
      unit: string;
      active: boolean;
    },
    stock: StockLevel[],
  ): PartListItemDto {
    const level = stock.reduce(
      (s, r) => ({ onHand: s.onHand.plus(r.onHand), value: s.value.plus(r.value) }),
      {
        onHand: new D(0),
        value: new D(0),
      },
    );
    const avg = averageCost(level);
    return {
      id: x.id,
      sku: x.sku,
      name: x.name,
      nameAr: x.nameAr,
      brand: x.brand,
      unit: x.unit,
      active: x.active,
      onHand: qty(level.onHand),
      value: money(level.value),
      averageCost: avg ? avg.toFixed(4) : null,
    };
  }

  async get(scope: CompanyScope, p: Principal, partId: string): Promise<PartDto> {
    const part = await this.prisma.part.findUnique({
      where: { companyId_id: { companyId: scope.companyId, id: partId } },
    });
    if (!part) throw notFound('Part');
    const where = this.branchWhere(scope);
    const [branches, stock, movements, receive, adjust] = await Promise.all([
      this.prisma.branch.findMany({
        where: {
          companyId: scope.companyId,
          status: 'active',
          ...(scope.allBranches ? {} : { id: { in: scope.branchIds } }),
        },
        orderBy: { code: 'asc' },
      }),
      this.prisma.stock.findMany({ where: { partId, ...where } }),
      this.prisma.stockMovement.findMany({
        where: { partId, ...where },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.scopeFor(p, scope.companyId, 'inventory.manage'),
      this.scopeFor(p, scope.companyId, 'inventory.adjust'),
    ]);
    const [users, journals] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: [...new Set(movements.map((m) => m.createdBy))] } },
        select: { id: true, displayName: true },
      }),
      this.prisma.journal.findMany({
        where: { id: { in: movements.map((m) => m.journalId) } },
        select: { id: true, number: true },
      }),
    ]);
    const has = (s: typeof receive, b: string) => !!s && (s.allBranches || s.branchIds.includes(b));
    const code = (b: string) => branches.find((x) => x.id === b)?.code ?? '—';
    return {
      ...this.item(part, stock),
      version: part.version,
      canEdit: !!receive?.allBranches,
      branches: branches.map((b) => {
        const s = stock.find((x) => x.branchId === b.id) ?? { onHand: new D(0), value: new D(0) };
        const avg = averageCost(s);
        return {
          branchId: b.id,
          branchCode: b.code,
          onHand: qty(s.onHand),
          value: money(s.value),
          averageCost: avg ? avg.toFixed(4) : null,
          canReceive: part.active && has(receive, b.id),
          canAdjust: has(adjust, b.id),
        };
      }),
      movements: movements.map((m) => ({
        id: m.id,
        number: m.number,
        branchCode: code(m.branchId),
        kind: m.kind,
        quantity: qty(m.quantity),
        unitCost: m.unitCost.toFixed(4),
        value: money(m.value),
        onHandAfter: qty(m.onHandAfter),
        valueAfter: money(m.valueAfter),
        reference: m.reference,
        reason: m.reason,
        journalNumber: journals.find((j) => j.id === m.journalId)?.number ?? '—',
        createdByName: users.find((u) => u.id === m.createdBy)?.displayName ?? '—',
        createdAt: m.createdAt.toISOString(),
      })),
    };
  }

  async create(scope: CompanyScope, p: Principal, input: CreatePartInput, ctx: AuditContext) {
    if (!(await this.can(p, scope.companyId, 'inventory.manage')))
      throw forbidden('Only stock managers for the whole company add parts to the catalogue');
    try {
      const id = await this.prisma.$transaction(async (tx) => {
        const part = await tx.part.create({ data: { companyId: scope.companyId, ...input } });
        await writeAudit(tx, ctx, {
          action: 'inventory.part.create',
          entityType: 'part',
          entityId: part.id,
          companyId: scope.companyId,
          after: input,
        });
        return part.id;
      });
      return this.get(scope, p, id);
    } catch (e) {
      if (unique(e)) throw conflict(`Part ${input.sku} already exists`);
      throw e;
    }
  }

  async update(scope: CompanyScope, p: Principal, partId: string, input: UpdatePartInput, ctx: AuditContext) {
    if (!(await this.can(p, scope.companyId, 'inventory.manage')))
      throw forbidden('Only stock managers for the whole company change the catalogue');
    await this.prisma.$transaction(async (tx) => {
      const n = await tx.part.updateMany({
        where: { id: partId, companyId: scope.companyId, version: input.version },
        data: {
          name: input.name,
          nameAr: input.nameAr,
          brand: input.brand,
          active: input.active,
          version: { increment: 1 },
        },
      });
      if (n.count === 0) {
        if (!(await tx.part.findFirst({ where: { id: partId, companyId: scope.companyId } })))
          throw notFound('Part');
        throw conflict('This part was changed by someone else; reload and try again');
      }
      await writeAudit(tx, ctx, {
        action: 'inventory.part.update',
        entityType: 'part',
        entityId: partId,
        companyId: scope.companyId,
        after: input,
      });
    });
    return this.get(scope, p, partId);
  }

  /** Shared frame: idempotency, scope and permission, accounts, stock row locked, movement + journal + balance. */
  private async move(
    scope: CompanyScope,
    p: Principal,
    partId: string,
    a: { branchId: string; idempotencyKey: string },
    permission: string,
    ctx: AuditContext,
    plan: (
      level: StockLevel,
      acc: { inventory: string; goodsReceived: string | null; adjustment: string | null },
    ) => {
      kind: 'receipt' | 'adjustment_in' | 'adjustment_out';
      quantity: Prisma.Decimal;
      unitCost: Prisma.Decimal;
      value: Prisma.Decimal;
      after: StockLevel;
      debit: string;
      credit: string;
      reference?: string | null;
      reason?: string | null;
    },
  ): Promise<PartDto> {
    const existing = await this.prisma.stockMovement.findUnique({
      where: { companyId_idempotencyKey: { companyId: scope.companyId, idempotencyKey: a.idempotencyKey } },
    });
    if (existing) {
      if (existing.partId !== partId || existing.branchId !== a.branchId)
        throw conflict('This form was already used for another movement');
      return this.get(scope, p, partId);
    }
    if (!scope.allBranches && !scope.branchIds.includes(a.branchId)) throw notFound('Branch');
    if (!(await this.can(p, scope.companyId, permission, a.branchId)))
      throw forbidden(
        permission === 'inventory.adjust'
          ? 'Only people allowed to adjust stock do this'
          : 'Only stock managers receive stock',
      );
    try {
      await this.prisma.$transaction(async (tx) => {
        const part = await tx.part.findUnique({
          where: { companyId_id: { companyId: scope.companyId, id: partId } },
        });
        if (!part) throw notFound('Part');
        const branch = await tx.branch.findUnique({
          where: { companyId_id: { companyId: scope.companyId, id: a.branchId } },
        });
        if (!branch) throw notFound('Branch');
        const settings = await tx.postingSettings.findUnique({ where: { companyId: scope.companyId } });
        if (!settings?.inventoryAccountId)
          throw unprocessable('The accountant must choose the inventory account first (Posting accounts)');
        await tx.$executeRaw`INSERT INTO inventory.stock (company_id, branch_id, part_id) VALUES (${scope.companyId}::uuid, ${a.branchId}::uuid, ${partId}::uuid) ON CONFLICT DO NOTHING`;
        const [row] = await tx.$queryRaw<{ on_hand: Prisma.Decimal; value: Prisma.Decimal }[]>`
          SELECT on_hand, value FROM inventory.stock WHERE branch_id = ${a.branchId}::uuid AND part_id = ${partId}::uuid FOR UPDATE`;
        const m = plan(
          { onHand: new D(row!.on_hand), value: new D(row!.value) },
          {
            inventory: settings.inventoryAccountId,
            goodsReceived: settings.goodsReceivedAccountId,
            adjustment: settings.stockAdjustmentAccountId,
          },
        );
        if (m.value.isZero())
          throw unprocessable('The value of this movement rounds to 0.00; check the quantity and cost');
        const company = await tx.company.findUniqueOrThrow({ where: { id: scope.companyId } });
        const today = localTime(new Date(), company.timezone).date;
        const year = today.slice(0, 4);
        const number = formatDocumentNumber(
          'SM',
          year,
          await nextDocumentNumber(tx, scope.companyId, 'stock_movement', year),
        );
        const id = (await tx.$queryRaw<{ id: string }[]>`SELECT gen_random_uuid()::text AS id`)[0]!.id;
        const label = `${number} · ${part.sku} · ${m.kind.replace('_', ' ')} ${qty(m.quantity)}`;
        const journal = await postSystemJournal(
          tx,
          { ...ctx, actorUserId: p.userId },
          {
            companyId: scope.companyId,
            branchId: a.branchId,
            postingDate: today,
            description: `${label}${m.reference ? ` · ${m.reference}` : ''}${m.reason ? ` · ${m.reason}` : ''}`,
            currency: company.baseCurrency,
            sourceType: 'stock',
            sourceId: id,
            lines: [
              { accountId: m.debit, debit: m.value, credit: new D(0), description: label },
              { accountId: m.credit, debit: new D(0), credit: m.value, description: label },
            ],
          },
        );
        await tx.stockMovement.create({
          data: {
            id,
            companyId: scope.companyId,
            branchId: a.branchId,
            partId,
            number,
            kind: m.kind,
            quantity: m.quantity,
            unitCost: m.unitCost,
            value: m.value,
            onHandAfter: m.after.onHand,
            valueAfter: m.after.value,
            reference: m.reference ?? null,
            reason: m.reason ?? null,
            idempotencyKey: a.idempotencyKey,
            journalId: journal.id,
            createdBy: p.userId,
          },
        });
        await tx.$executeRaw`UPDATE inventory.stock SET on_hand = ${m.after.onHand}, value = ${m.after.value}, updated_at = now()
                              WHERE branch_id = ${a.branchId}::uuid AND part_id = ${partId}::uuid`;
        await writeAudit(tx, ctx, {
          action: `inventory.stock.${m.kind}`,
          entityType: 'stock_movement',
          entityId: id,
          companyId: scope.companyId,
          branchId: a.branchId,
          reason: m.reason ?? undefined,
          after: {
            number,
            sku: part.sku,
            quantity: qty(m.quantity),
            value: money(m.value),
            journal: journal.number,
          },
        });
      });
    } catch (e) {
      if (unique(e)) return this.get(scope, p, partId); // the same form, submitted twice at once
      throw e;
    }
    return this.get(scope, p, partId);
  }

  receive(scope: CompanyScope, p: Principal, partId: string, input: ReceiveStockInput, ctx: AuditContext) {
    return this.move(scope, p, partId, input, 'inventory.manage', ctx, (level, acc) => {
      if (!acc.goodsReceived)
        throw unprocessable('The accountant must choose the goods received account first (Posting accounts)');
      const c = stockIn(level, new D(input.quantity), new D(input.unitCost));
      return {
        kind: 'receipt',
        quantity: new D(input.quantity),
        unitCost: c.unitCost,
        value: c.movementValue,
        after: c.after,
        debit: acc.inventory,
        credit: acc.goodsReceived,
        reference: input.reference,
      };
    });
  }

  adjust(scope: CompanyScope, p: Principal, partId: string, input: AdjustStockInput, ctx: AuditContext) {
    return this.move(scope, p, partId, input, 'inventory.adjust', ctx, (level, acc) => {
      if (!acc.adjustment)
        throw unprocessable(
          'The accountant must choose the stock adjustment account first (Posting accounts)',
        );
      const q = new D(input.quantity);
      if (input.direction === 'in') {
        const c = stockIn(level, q, new D(input.unitCost!));
        return {
          kind: 'adjustment_in',
          quantity: q,
          unitCost: c.unitCost,
          value: c.movementValue,
          after: c.after,
          debit: acc.inventory,
          credit: acc.adjustment,
          reason: input.reason,
        };
      }
      if (q.greaterThan(level.onHand))
        throw unprocessable(`Only ${qty(level.onHand)} on hand; stock cannot go below zero`);
      const c = stockOut(level, q);
      return {
        kind: 'adjustment_out',
        quantity: q,
        unitCost: c.unitCost,
        value: c.movementValue,
        after: c.after,
        debit: acc.adjustment,
        credit: acc.inventory,
        reason: input.reason,
      };
    });
  }

  /** Stock value by part, and the inventory account's ledger balance for the same branches. */
  async valuation(scope: CompanyScope, branchId?: string): Promise<ValuationDto> {
    const where = this.branchWhere(scope, branchId);
    const asOf = new Date();
    const data = await this.prisma.$transaction(
      async (tx) => {
        const stock = await tx.stock.findMany({
          where: { companyId: scope.companyId, ...where },
          include: { part: true },
        });
        const settings = await tx.postingSettings.findUnique({ where: { companyId: scope.companyId } });
        const ledger = settings?.inventoryAccountId
          ? await tx.journalLine.aggregate({
              where: { companyId: scope.companyId, accountId: settings.inventoryAccountId, ...where },
              _sum: { debit: true, credit: true },
            })
          : null;
        return { stock, ledger };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: scope.companyId } });
    const byPart = new Map<string, { part: (typeof data.stock)[number]['part']; level: StockLevel }>();
    for (const s of data.stock) {
      const e = byPart.get(s.partId) ?? { part: s.part, level: { onHand: new D(0), value: new D(0) } };
      e.level = { onHand: e.level.onHand.plus(s.onHand), value: e.level.value.plus(s.value) };
      byPart.set(s.partId, e);
    }
    const rows = [...byPart.values()]
      .filter((r) => r.level.onHand.greaterThan(0))
      .sort((a, b) => a.part.sku.localeCompare(b.part.sku))
      .map((r) => ({
        partId: r.part.id,
        sku: r.part.sku,
        name: r.part.name,
        unit: r.part.unit,
        onHand: qty(r.level.onHand),
        averageCost: averageCost(r.level)?.toFixed(4) ?? null,
        value: money(r.level.value),
      }));
    const total = data.stock.reduce((s, r) => s.plus(r.value), new D(0));
    const ledger = data.ledger
      ? new D(data.ledger._sum.debit ?? 0).minus(data.ledger._sum.credit ?? 0)
      : null;
    return {
      branchId: branchId ?? null,
      asOf: asOf.toISOString(),
      currency: company.baseCurrency,
      rows,
      totalValue: money(total),
      ledgerBalance: ledger ? money(ledger) : null,
      reconciled: !!ledger && ledger.toDecimalPlaces(2).equals(total),
    };
  }
}
