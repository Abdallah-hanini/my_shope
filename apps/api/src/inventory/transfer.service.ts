import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CancelTransferInput, CreateTransferInput, TransferListQuery } from '@erp/validation';
import type { CompanyScope, Principal } from '../auth/principal';
import { AuthzService } from '../authz/authz.service';
import { resolveScope } from '../authz/scope';
import { conflict, forbidden, notFound, unprocessable } from '../common/errors';
import { PrismaService } from '../infra/prisma.service';
import { writeAudit, type AuditContext } from '../platform/audit';
import { formatDocumentNumber, nextDocumentNumber } from '../platform/sequence';
import { allocateArrivals } from '../workshop/special-orders';
import { localTime } from '../workshop/scheduling';
import { applyMovement } from './movement';
import { stockOut } from './stock-math';
import type { TransferDto, TransferListDto, TransferSummaryDto } from './transfer.dto';

type Tx = Prisma.TransactionClient;
const D = Prisma.Decimal;
const money = (d: Prisma.Decimal) => d.toFixed(2);
const unique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
const include = {
  fromBranch: { select: { code: true } },
  toBranch: { select: { code: true } },
  lines: { orderBy: { lineNo: 'asc' }, include: { part: true } },
} satisfies Prisma.StockTransferInclude;
type Row = Prisma.StockTransferGetPayload<{ include: typeof include }>;

const transitMissing = 'The accountant must choose the stock in transit account first (Posting accounts)';

/**
 * Stock transfers between branches (T-78). Sending takes each part out of the source branch at its
 * weighted average (never stock reserved for jobs) into stock in transit (Dr transit / Cr
 * inventory); the receiving branch confirms and takes it in at exactly the value sent (Dr inventory
 * / Cr transit), which also serves its waiting special orders; a transfer still in transit can be
 * cancelled by the source, putting the stock back at the same value. Stock managers
 * (`inventory.manage`) of the branch concerned act; every step is numbered, posted and audited.
 */
@Injectable()
export class TransferService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthzService,
  ) {}

  private async manageScope(p: Principal, companyId: string) {
    return resolveScope(companyId, 'inventory.manage', await this.authz.grants(p.userId, companyId));
  }
  private sees(scope: CompanyScope, ...branchIds: string[]) {
    return scope.allBranches || branchIds.some((b) => scope.branchIds.includes(b));
  }

  private summary(t: Row, names: Map<string, string>): TransferSummaryDto {
    return {
      id: t.id,
      number: t.number,
      fromBranchCode: t.fromBranch.code,
      toBranchCode: t.toBranch.code,
      status: t.status,
      lineCount: t.lines.length,
      value: money(t.lines.reduce((s, l) => s.plus(l.value), new D(0))),
      dispatchedByName: names.get(t.dispatchedBy) ?? '—',
      dispatchedAt: t.dispatchedAt.toISOString(),
      receivedAt: t.receivedAt?.toISOString() ?? null,
    };
  }
  private async names(ids: (string | null)[]) {
    const u = [...new Set(ids.filter((x): x is string => !!x))];
    const rows = u.length
      ? await this.prisma.user.findMany({ where: { id: { in: u } }, select: { id: true, displayName: true } })
      : [];
    return new Map(rows.map((r) => [r.id, r.displayName]));
  }

  async list(scope: CompanyScope, p: Principal, q: TransferListQuery): Promise<TransferListDto> {
    const visible = scope.allBranches
      ? {}
      : { OR: [{ fromBranchId: { in: scope.branchIds } }, { toBranchId: { in: scope.branchIds } }] };
    const [rows, branches, manage] = await Promise.all([
      this.prisma.stockTransfer.findMany({
        where: {
          companyId: scope.companyId,
          ...visible,
          ...(q.status === 'all' ? {} : { status: 'in_transit' }),
        },
        include,
        orderBy: { dispatchedAt: 'desc' },
        take: 500,
      }),
      this.prisma.branch.findMany({
        where: { companyId: scope.companyId, status: 'active' },
        select: { id: true, code: true },
        orderBy: { code: 'asc' },
      }),
      this.manageScope(p, scope.companyId),
    ]);
    const names = await this.names(rows.map((r) => r.dispatchedBy));
    return {
      transfers: rows.map((r) => this.summary(r, names)),
      fromBranches:
        branches.length > 1 && manage
          ? branches.filter((b) => manage.allBranches || manage.branchIds.includes(b.id))
          : [],
      toBranches: branches,
    };
  }

  async get(scope: CompanyScope, p: Principal, transferId: string): Promise<TransferDto> {
    const t = await this.prisma.stockTransfer.findFirst({
      where: { id: transferId, companyId: scope.companyId },
      include,
    });
    if (!t || !this.sees(scope, t.fromBranchId, t.toBranchId)) throw notFound('Transfer');
    const [names, moves, manage] = await Promise.all([
      this.names([t.dispatchedBy, t.receivedBy, t.cancelledBy]),
      this.prisma.stockMovement.findMany({
        where: {
          id: {
            in: t.lines
              .flatMap((l) => [l.outMovementId, l.inMovementId, l.backMovementId])
              .filter((x): x is string => !!x),
          },
        },
        select: { id: true, number: true },
      }),
      this.manageScope(p, scope.companyId),
    ]);
    const num = (id: string | null) => (id ? (moves.find((m) => m.id === id)?.number ?? '—') : null);
    const can = (b: string) => !!manage && (manage.allBranches || manage.branchIds.includes(b));
    const actions: string[] = [];
    if (t.status === 'in_transit') {
      if (can(t.toBranchId)) actions.push('receive');
      if (can(t.fromBranchId)) actions.push('cancel');
    }
    return {
      ...this.summary(t, names),
      note: t.note,
      receivedByName: t.receivedBy ? (names.get(t.receivedBy) ?? '—') : null,
      cancelledByName: t.cancelledBy ? (names.get(t.cancelledBy) ?? '—') : null,
      cancelledAt: t.cancelledAt?.toISOString() ?? null,
      cancelReason: t.cancelReason,
      lines: t.lines.map((l) => ({
        lineNo: l.lineNo,
        partId: l.partId,
        sku: l.part.sku,
        partName: l.part.name,
        unit: l.part.unit,
        quantity: l.quantity.toFixed(3),
        value: money(l.value),
        outNumber: num(l.outMovementId)!,
        inNumber: num(l.inMovementId),
        backNumber: num(l.backMovementId),
      })),
      actions,
    };
  }

  private async mustManage(p: Principal, companyId: string, branchId: string, what: string) {
    const s = await this.manageScope(p, companyId);
    if (!s || !(s.allBranches || s.branchIds.includes(branchId)))
      throw forbidden(`Only stock managers of the ${what} branch do this`);
  }

  async create(scope: CompanyScope, p: Principal, input: CreateTransferInput, ctx: AuditContext) {
    const existing = await this.prisma.stockTransfer.findUnique({
      where: {
        companyId_idempotencyKey: { companyId: scope.companyId, idempotencyKey: input.idempotencyKey },
      },
    });
    if (existing) return this.get(scope, p, existing.id);
    if (!this.sees(scope, input.fromBranchId)) throw notFound('Branch');
    await this.mustManage(p, scope.companyId, input.fromBranchId, 'sending');
    let id: string;
    try {
      id = await this.prisma.$transaction(async (tx) => {
        const [from, to] = await Promise.all(
          [input.fromBranchId, input.toBranchId].map((b) =>
            tx.branch.findUnique({ where: { companyId_id: { companyId: scope.companyId, id: b } } }),
          ),
        );
        if (!from || !to) throw notFound('Branch');
        if (to.status !== 'active') throw unprocessable(`Branch ${to.code} is not active`);
        const settings = await tx.postingSettings.findUnique({ where: { companyId: scope.companyId } });
        if (!settings?.transitAccountId) throw unprocessable(transitMissing);
        const company = await tx.company.findUniqueOrThrow({ where: { id: scope.companyId } });
        const year = localTime(new Date(), company.timezone).date.slice(0, 4);
        const number = formatDocumentNumber(
          'ST',
          year,
          await nextDocumentNumber(tx, scope.companyId, 'stock_transfer', year),
        );
        const transferId = (await tx.$queryRaw<{ id: string }[]>`SELECT gen_random_uuid()::text AS id`)[0]!
          .id;
        await tx.stockTransfer.create({
          data: {
            id: transferId,
            companyId: scope.companyId,
            number,
            fromBranchId: from.id,
            toBranchId: to.id,
            note: input.note,
            idempotencyKey: input.idempotencyKey,
            dispatchedBy: p.userId,
          },
        });
        let lineNo = 0;
        for (const l of input.lines) {
          const part = await tx.part.findUnique({
            where: { companyId_id: { companyId: scope.companyId, id: l.partId } },
          });
          if (!part || !part.active) throw notFound('Part');
          const qty = new D(l.quantity);
          // Lock the source stock first: what jobs have reserved stays at the branch.
          await tx.$queryRaw`SELECT 1 FROM inventory.stock WHERE branch_id = ${from.id}::uuid AND part_id = ${part.id}::uuid FOR UPDATE`;
          const reserved = new D(
            (
              await tx.jobPart.aggregate({
                where: { branchId: from.id, partId: part.id, status: 'reserved' },
                _sum: { quantity: true },
              })
            )._sum.quantity ?? 0,
          );
          const mv = await applyMovement(
            tx,
            { ...ctx, actorUserId: p.userId },
            {
              companyId: scope.companyId,
              branchId: from.id,
              partId: part.id,
              idempotencyKey: `${input.idempotencyKey}:${part.id}`,
              transferId,
            },
            (level, acc) => {
              const free = level.onHand.minus(reserved);
              if (qty.greaterThan(free))
                throw unprocessable(
                  `Only ${(free.isNegative() ? new D(0) : free).toFixed(3)} ${part.unit} of ${part.sku} can be sent from ${from.code} (the rest is reserved for jobs or not in stock)`,
                );
              const c = stockOut(level, qty);
              return {
                kind: 'transfer_out',
                quantity: qty,
                unitCost: c.unitCost,
                value: c.movementValue,
                after: c.after,
                debit: acc.transit!,
                credit: acc.inventory,
                reference: `${number} → ${to.code}`,
              };
            },
          );
          await tx.stockTransferLine.create({
            data: {
              transferId,
              lineNo: ++lineNo,
              companyId: scope.companyId,
              partId: part.id,
              quantity: qty,
              value: mv.value,
              outMovementId: mv.id,
            },
          });
        }
        await writeAudit(tx, ctx, {
          action: 'inventory.transfer.send',
          entityType: 'stock_transfer',
          entityId: transferId,
          companyId: scope.companyId,
          branchId: from.id,
          after: { number, from: from.code, to: to.code, lines: input.lines },
        });
        return transferId;
      });
    } catch (e) {
      if (unique(e)) {
        const again = await this.prisma.stockTransfer.findUnique({
          where: {
            companyId_idempotencyKey: { companyId: scope.companyId, idempotencyKey: input.idempotencyKey },
          },
        });
        if (again) return this.get(scope, p, again.id);
      }
      throw e;
    }
    return this.get(scope, p, id);
  }

  /** Lock the transfer and check it is still in transit and visible. */
  private async lock(tx: Tx, scope: CompanyScope, transferId: string) {
    await tx.$queryRaw`SELECT 1 FROM inventory.stock_transfer WHERE id = ${transferId}::uuid FOR UPDATE`;
    const t = await tx.stockTransfer.findFirst({
      where: { id: transferId, companyId: scope.companyId },
      include: { ...include, fromBranch: { select: { code: true } }, toBranch: { select: { code: true } } },
    });
    if (!t || !this.sees(scope, t.fromBranchId, t.toBranchId)) throw notFound('Transfer');
    if (t.status !== 'in_transit') throw conflict(`This transfer is ${t.status.replace('_', ' ')}`);
    return t;
  }

  /** Bring every line in at the receiving branch at exactly the value sent (or back at the source). */
  private async bringIn(
    tx: Tx,
    ctx: AuditContext & { actorUserId: string },
    t: Row,
    kind: 'transfer_in' | 'transfer_back',
  ) {
    const branchId = kind === 'transfer_in' ? t.toBranchId : t.fromBranchId;
    for (const l of t.lines) {
      const mv = await applyMovement(
        tx,
        ctx,
        {
          companyId: t.companyId,
          branchId,
          partId: l.partId,
          idempotencyKey: `${t.id}:${kind}:${l.lineNo}`,
          transferId: t.id,
        },
        (level, acc) => {
          if (!acc.transit) throw unprocessable(transitMissing);
          return {
            kind,
            quantity: l.quantity,
            unitCost: l.value.div(l.quantity).toDecimalPlaces(4, D.ROUND_HALF_UP),
            value: l.value,
            after: { onHand: level.onHand.plus(l.quantity), value: level.value.plus(l.value) },
            debit: acc.inventory,
            credit: acc.transit,
            reference: kind === 'transfer_in' ? `${t.number} ← ${t.fromBranch.code}` : `${t.number} back`,
          };
        },
      );
      await tx.stockTransferLine.update({
        where: { transferId_lineNo: { transferId: t.id, lineNo: l.lineNo } },
        data: kind === 'transfer_in' ? { inMovementId: mv.id } : { backMovementId: mv.id },
      });
      // Parts ordered for jobs at that branch take the stock first (T-77).
      await allocateArrivals(tx, ctx, {
        companyId: t.companyId,
        branchId,
        partId: l.partId,
        receipt: mv.number,
      });
    }
  }

  async receive(scope: CompanyScope, p: Principal, transferId: string, ctx: AuditContext) {
    await this.prisma.$transaction(async (tx) => {
      const t = await this.lock(tx, scope, transferId);
      await this.mustManage(p, scope.companyId, t.toBranchId, 'receiving');
      await this.bringIn(tx, { ...ctx, actorUserId: p.userId }, t, 'transfer_in');
      await tx.stockTransfer.update({
        where: { id: t.id },
        data: { status: 'received', receivedBy: p.userId, receivedAt: new Date() },
      });
      await writeAudit(tx, ctx, {
        action: 'inventory.transfer.receive',
        entityType: 'stock_transfer',
        entityId: t.id,
        companyId: scope.companyId,
        branchId: t.toBranchId,
        after: { number: t.number },
      });
    });
    return this.get(scope, p, transferId);
  }

  async cancel(
    scope: CompanyScope,
    p: Principal,
    transferId: string,
    input: CancelTransferInput,
    ctx: AuditContext,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const t = await this.lock(tx, scope, transferId);
      await this.mustManage(p, scope.companyId, t.fromBranchId, 'sending');
      await this.bringIn(tx, { ...ctx, actorUserId: p.userId }, t, 'transfer_back');
      await tx.stockTransfer.update({
        where: { id: t.id },
        data: {
          status: 'cancelled',
          cancelledBy: p.userId,
          cancelledAt: new Date(),
          cancelReason: input.reason,
        },
      });
      await writeAudit(tx, ctx, {
        action: 'inventory.transfer.cancel',
        entityType: 'stock_transfer',
        entityId: t.id,
        companyId: scope.companyId,
        branchId: t.fromBranchId,
        reason: input.reason,
        after: { number: t.number },
      });
    });
    return this.get(scope, p, transferId);
  }
}
