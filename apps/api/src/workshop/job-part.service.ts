import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  AddJobPartInput,
  CancelOrderInput,
  JobPartStepInput,
  OrderJobPartInput,
  SpecialOrderListQuery,
} from '@erp/validation';
import type { CompanyScope, Principal } from '../auth/principal';
import { AuthzService } from '../authz/authz.service';
import { resolveScope } from '../authz/scope';
import { conflict, forbidden, notFound, unprocessable } from '../common/errors';
import { PrismaService } from '../infra/prisma.service';
import { applyMovement } from '../inventory/movement';
import { stockOut } from '../inventory/stock-math';
import { writeAudit, type AuditContext } from '../platform/audit';
import type { JobPartsDto, SpecialOrderListDto } from './job-part.dto';

type Tx = Prisma.TransactionClient;
const D = Prisma.Decimal;
/** Parts are reserved and released before the quality check; issued once the customer authorised. */
const ADD_STATUSES = ['draft', 'approved', 'assigned', 'in_progress', 'rework'];
const ISSUE_STATUSES = ['approved', 'assigned', 'in_progress', 'rework'];
const OPEN_STATUSES = ['draft', 'approved', 'assigned', 'in_progress', 'rework', 'qc', 'ready'];

/**
 * Parts on a job (T-75): reserved from the branch's stock (never more than is available: on hand
 * minus other reservations; database-checked with the stock row locked), released, issued (stock out
 * at weighted average, Dr cost of parts sold / Cr inventory) or returned (back in at the issue
 * cost). Managers or stock managers of the branch act; every step is audited and on the timeline.
 */
@Injectable()
export class JobPartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthzService,
  ) {}

  private async can(p: Principal, companyId: string, branchId: string) {
    const grants = await this.authz.grants(p.userId, companyId);
    return ['workshop.job.manage', 'inventory.manage'].some((perm) => {
      const s = resolveScope(companyId, perm, grants);
      return !!s && (s.allBranches || s.branchIds.includes(branchId));
    });
  }

  private async job(db: Tx | PrismaService, scope: CompanyScope, jobId: string, lock = false) {
    if (lock) await db.$queryRaw`SELECT 1 FROM workshop.job_card WHERE id = ${jobId}::uuid FOR UPDATE`;
    const j = await db.jobCard.findUnique({
      where: { companyId_id: { companyId: scope.companyId, id: jobId } },
    });
    if (!j || (!scope.allBranches && !scope.branchIds.includes(j.branchId))) throw notFound('Job card');
    return j;
  }

  private async available(db: Tx | PrismaService, branchId: string, partIds?: string[]) {
    const [stock, reserved] = await Promise.all([
      db.stock.findMany({ where: { branchId, ...(partIds ? { partId: { in: partIds } } : {}) } }),
      db.jobPart.groupBy({
        by: ['partId'],
        where: { branchId, status: 'reserved', ...(partIds ? { partId: { in: partIds } } : {}) },
        _sum: { quantity: true },
      }),
    ]);
    return new Map(
      stock.map((s) => [
        s.partId,
        s.onHand.minus(reserved.find((r) => r.partId === s.partId)?._sum.quantity ?? 0),
      ]),
    );
  }

  async list(scope: CompanyScope, p: Principal, jobId: string): Promise<JobPartsDto> {
    const job = await this.job(this.prisma, scope, jobId);
    const [rows, allowed] = await Promise.all([
      this.prisma.jobPart.findMany({
        where: { jobId },
        include: { part: true, supplier: { select: { name: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      this.can(p, scope.companyId, job.branchId),
    ]);
    const canOrder = allowed && ISSUE_STATUSES.includes(job.status);
    const needAvail = canOrder || rows.some((r) => r.status === 'ordered');
    const movements = await this.prisma.stockMovement.findMany({
      where: {
        id: {
          in: rows.flatMap((r) => [r.issueMovementId, r.returnMovementId]).filter((x): x is string => !!x),
        },
      },
      select: { id: true, number: true },
    });
    const num = (id: string | null) => movements.find((m) => m.id === id)?.number ?? null;
    const canAdd = allowed && ADD_STATUSES.includes(job.status);
    let choices: JobPartsDto['choices'] = [];
    let orderChoices: JobPartsDto['orderChoices'] = [];
    let suppliers: JobPartsDto['suppliers'] = [];
    const avail = canAdd || needAvail ? await this.available(this.prisma, job.branchId) : new Map();
    const free = (partId: string) => avail.get(partId) ?? new D(0);
    if (canOrder) {
      const [parts, sups] = await Promise.all([
        this.prisma.part.findMany({
          where: { companyId: scope.companyId, active: true },
          orderBy: { sku: 'asc' },
          take: 1000,
        }),
        this.prisma.supplier.findMany({
          where: { companyId: scope.companyId, active: true },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        }),
      ]);
      orderChoices = parts.map((x) => ({
        partId: x.id,
        sku: x.sku,
        name: x.name,
        unit: x.unit,
        available: free(x.id).toFixed(3),
        salePrice: x.salePrice?.toFixed(2) ?? null,
      }));
      suppliers = sups;
    }
    if (canAdd) {
      const parts = await this.prisma.part.findMany({
        where: { companyId: scope.companyId, active: true, id: { in: [...avail.keys()] } },
        orderBy: { sku: 'asc' },
      });
      choices = parts
        .filter((x) => avail.get(x.id)!.greaterThan(0))
        .map((x) => ({
          partId: x.id,
          sku: x.sku,
          name: x.name,
          unit: x.unit,
          available: avail.get(x.id)!.toFixed(3),
          salePrice: x.salePrice?.toFixed(2) ?? null,
        }));
    }
    return {
      jobId,
      canAdd,
      choices,
      canOrder,
      orderChoices,
      suppliers,
      parts: rows.map((r) => {
        const actions: string[] = [];
        if (allowed && r.status === 'ordered') {
          if (ADD_STATUSES.includes(job.status) && !free(r.partId).lessThan(r.quantity))
            actions.push('allocate');
          actions.push('cancelOrder');
        }
        if (allowed && r.status === 'reserved' && OPEN_STATUSES.includes(job.status)) actions.push('release');
        if (allowed && r.status === 'reserved' && ISSUE_STATUSES.includes(job.status)) actions.push('issue');
        if (allowed && r.status === 'issued' && OPEN_STATUSES.includes(job.status)) actions.push('return');
        return {
          id: r.id,
          partId: r.partId,
          sku: r.part.sku,
          name: r.part.name,
          unit: r.part.unit,
          quantity: r.quantity.toFixed(3),
          status: r.status,
          cost: r.cost?.toFixed(2) ?? null,
          salePrice: r.part.salePrice?.toFixed(2) ?? null,
          issueNumber: num(r.issueMovementId),
          returnNumber: num(r.returnMovementId),
          orderedAt: r.orderedAt?.toISOString() ?? null,
          supplierName: r.supplier?.name ?? null,
          orderRef: r.orderRef,
          arrivedAt: r.arrivedAt?.toISOString() ?? null,
          cancelReason: r.cancelReason,
          actions,
        };
      }),
    };
  }

  private event(tx: Tx, job: { id: string; companyId: string }, actor: string, kind: string, note: string) {
    return tx.jobEvent.create({
      data: { companyId: job.companyId, jobId: job.id, actorUserId: actor, kind, note },
    });
  }

  async add(scope: CompanyScope, p: Principal, jobId: string, input: AddJobPartInput, ctx: AuditContext) {
    try {
      await this.prisma.$transaction(async (tx) => {
        const job = await this.job(tx, scope, jobId, true);
        if (!(await this.can(p, scope.companyId, job.branchId)))
          throw forbidden('Only managers or stock managers reserve parts');
        if (!ADD_STATUSES.includes(job.status)) throw conflict('Parts are added before the quality check');
        const part = await tx.part.findUnique({
          where: { companyId_id: { companyId: scope.companyId, id: input.partId } },
        });
        if (!part || !part.active) throw notFound('Part');
        await tx.$queryRaw`SELECT 1 FROM inventory.stock WHERE branch_id = ${job.branchId}::uuid AND part_id = ${part.id}::uuid FOR UPDATE`;
        const avail = (await this.available(tx, job.branchId, [part.id])).get(part.id) ?? new D(0);
        if (avail.lessThan(input.quantity))
          throw unprocessable(
            `Only ${avail.toFixed(3)} ${part.unit} of ${part.sku} available at this branch`,
          );
        const jp = await tx.jobPart.create({
          data: {
            companyId: scope.companyId,
            branchId: job.branchId,
            jobId,
            partId: part.id,
            quantity: input.quantity,
            createdBy: p.userId,
          },
        });
        await this.event(
          tx,
          job,
          p.userId,
          'part_reserved',
          `${part.sku} × ${new D(input.quantity).toFixed(3)}`,
        );
        await writeAudit(tx, ctx, {
          action: 'workshop.part.reserve',
          entityType: 'job_part',
          entityId: jp.id,
          companyId: scope.companyId,
          branchId: job.branchId,
          after: input,
        });
      });
    } catch (e) {
      if (e instanceof Error && /job_part_not_available/.test(e.message))
        throw unprocessable('Not enough of this part is available at this branch');
      throw e;
    }
    return this.list(scope, p, jobId);
  }

  private async step(
    scope: CompanyScope,
    p: Principal,
    jobPartId: string,
    ctx: AuditContext,
    run: (
      tx: Tx,
      jp: Prisma.JobPartGetPayload<{ include: { part: true } }>,
      job: { id: string; companyId: string; status: string; number: string; branchId: string },
    ) => Promise<string>,
  ) {
    const pre = await this.prisma.jobPart.findFirst({ where: { id: jobPartId, companyId: scope.companyId } });
    if (!pre) throw notFound('Job part');
    await this.prisma.$transaction(async (tx) => {
      const job = await this.job(tx, scope, pre.jobId, true);
      if (!(await this.can(p, scope.companyId, job.branchId)))
        throw forbidden('Only managers or stock managers move parts for jobs');
      await tx.$queryRaw`SELECT 1 FROM workshop.job_part WHERE id = ${jobPartId}::uuid FOR UPDATE`;
      const jp = await tx.jobPart.findUniqueOrThrow({ where: { id: jobPartId }, include: { part: true } });
      const action = await run(tx, jp, job);
      await writeAudit(tx, ctx, {
        action,
        entityType: 'job_part',
        entityId: jp.id,
        companyId: scope.companyId,
        branchId: job.branchId,
      });
    });
    return this.list(scope, p, pre.jobId);
  }

  /** Order a part for the job (T-77): after the customer authorised, when the branch has too little. */
  async order(scope: CompanyScope, p: Principal, jobId: string, input: OrderJobPartInput, ctx: AuditContext) {
    await this.prisma.$transaction(async (tx) => {
      const job = await this.job(tx, scope, jobId, true);
      if (!(await this.can(p, scope.companyId, job.branchId)))
        throw forbidden('Only managers or stock managers order parts');
      if (!ISSUE_STATUSES.includes(job.status))
        throw conflict('Parts are ordered once the customer authorised the work, before the quality check');
      const part = await tx.part.findUnique({
        where: { companyId_id: { companyId: scope.companyId, id: input.partId } },
      });
      if (!part || !part.active) throw notFound('Part');
      let supplierName: string | null = null;
      if (input.supplierId) {
        const sup = await tx.supplier.findUnique({
          where: { companyId_id: { companyId: scope.companyId, id: input.supplierId } },
        });
        if (!sup) throw notFound('Supplier');
        if (!sup.active) throw unprocessable(`Supplier ${sup.name} is inactive`);
        supplierName = sup.name;
      }
      const avail = (await this.available(tx, job.branchId, [part.id])).get(part.id) ?? new D(0);
      if (!avail.lessThan(input.quantity))
        throw conflict(
          `${avail.toFixed(3)} ${part.unit} of ${part.sku} are available at this branch; reserve it instead of ordering`,
        );
      const jp = await tx.jobPart.create({
        data: {
          companyId: scope.companyId,
          branchId: job.branchId,
          jobId,
          partId: part.id,
          quantity: input.quantity,
          status: 'ordered',
          orderedAt: new Date(),
          supplierId: input.supplierId ?? null,
          orderRef: input.orderRef ?? null,
          createdBy: p.userId,
        },
      });
      await this.event(
        tx,
        job,
        p.userId,
        'part_ordered',
        `${part.sku} × ${new D(input.quantity).toFixed(3)}${supplierName ? ` · ${supplierName}` : ''}${input.orderRef ? ` · ${input.orderRef}` : ''}`,
      );
      await writeAudit(tx, ctx, {
        action: 'workshop.part.order',
        entityType: 'job_part',
        entityId: jp.id,
        companyId: scope.companyId,
        branchId: job.branchId,
        after: input,
      });
    });
    return this.list(scope, p, jobId);
  }

  cancelOrder(
    scope: CompanyScope,
    p: Principal,
    jobPartId: string,
    input: CancelOrderInput,
    ctx: AuditContext,
  ) {
    return this.step(scope, p, jobPartId, ctx, async (tx, jp, job) => {
      if (jp.status !== 'ordered') throw conflict(`This part is ${jp.status}`);
      await tx.jobPart.update({
        where: { id: jp.id },
        data: { status: 'cancelled', cancelReason: input.reason },
      });
      await this.event(
        tx,
        job,
        p.userId,
        'part_order_cancelled',
        `${jp.part.sku} × ${jp.quantity.toFixed(3)} · ${input.reason}`,
      );
      return 'workshop.part.order_cancel';
    });
  }

  /** Reserve an ordered part from stock that is already there (e.g. released by another job). */
  allocate(scope: CompanyScope, p: Principal, jobPartId: string, ctx: AuditContext) {
    return this.step(scope, p, jobPartId, ctx, async (tx, jp, job) => {
      if (jp.status !== 'ordered') throw conflict(`This part is ${jp.status}`);
      if (!ADD_STATUSES.includes(job.status)) throw conflict(`The job is ${job.status}`);
      await tx.$queryRaw`SELECT 1 FROM inventory.stock WHERE branch_id = ${job.branchId}::uuid AND part_id = ${jp.partId}::uuid FOR UPDATE`;
      const avail = (await this.available(tx, job.branchId, [jp.partId])).get(jp.partId) ?? new D(0);
      if (avail.lessThan(jp.quantity))
        throw unprocessable(
          `Only ${avail.toFixed(3)} ${jp.part.unit} of ${jp.part.sku} available at this branch`,
        );
      await tx.jobPart.update({ where: { id: jp.id }, data: { status: 'reserved', arrivedAt: new Date() } });
      await this.event(tx, job, p.userId, 'part_arrived', `${jp.part.sku} × ${jp.quantity.toFixed(3)}`);
      return 'workshop.part.allocate';
    });
  }

  /** Parts ordered for jobs, oldest first, in the caller's branches (T-77). */
  async specialOrders(scope: CompanyScope, q: SpecialOrderListQuery): Promise<SpecialOrderListDto> {
    if (q.branchId && !scope.allBranches && !scope.branchIds.includes(q.branchId)) throw notFound('Branch');
    const rows = await this.prisma.jobPart.findMany({
      where: {
        companyId: scope.companyId,
        orderedAt: { not: null },
        ...(q.status === 'all' ? {} : { status: 'ordered' }),
        ...(q.branchId
          ? { branchId: q.branchId }
          : scope.allBranches
            ? {}
            : { branchId: { in: scope.branchIds } }),
      },
      include: {
        part: true,
        supplier: { select: { name: true } },
        job: {
          select: {
            number: true,
            status: true,
            branch: { select: { code: true } },
            customer: { select: { name: true } },
            vehicle: { select: { plate: true } },
          },
        },
      },
      orderBy: { orderedAt: 'asc' },
      take: 500,
    });
    const now = Date.now();
    return {
      orders: rows.map((r) => ({
        id: r.id,
        jobId: r.jobId,
        jobNumber: r.job.number,
        jobStatus: r.job.status,
        branchCode: r.job.branch.code,
        customerName: r.job.customer.name,
        plate: r.job.vehicle.plate,
        partId: r.partId,
        sku: r.part.sku,
        partName: r.part.name,
        unit: r.part.unit,
        quantity: r.quantity.toFixed(3),
        status: r.status,
        supplierName: r.supplier?.name ?? null,
        orderRef: r.orderRef,
        orderedAt: r.orderedAt!.toISOString(),
        arrivedAt: r.arrivedAt?.toISOString() ?? null,
        daysWaiting: Math.floor(((r.arrivedAt?.getTime() ?? now) - r.orderedAt!.getTime()) / 86_400_000),
      })),
    };
  }

  release(scope: CompanyScope, p: Principal, jobPartId: string, ctx: AuditContext) {
    return this.step(scope, p, jobPartId, ctx, async (tx, jp, job) => {
      if (jp.status !== 'reserved') throw conflict(`This part is ${jp.status}`);
      if (!OPEN_STATUSES.includes(job.status)) throw conflict(`The job is ${job.status}`);
      await tx.jobPart.update({ where: { id: jp.id }, data: { status: 'released' } });
      await this.event(
        tx,
        job,
        ctx.actorUserId!,
        'part_released',
        `${jp.part.sku} × ${jp.quantity.toFixed(3)}`,
      );
      return 'workshop.part.release';
    });
  }

  async issue(
    scope: CompanyScope,
    p: Principal,
    jobPartId: string,
    input: JobPartStepInput,
    ctx: AuditContext,
  ) {
    if (
      await this.prisma.stockMovement.findUnique({
        where: {
          companyId_idempotencyKey: { companyId: scope.companyId, idempotencyKey: input.idempotencyKey },
        },
      })
    ) {
      const jp = await this.prisma.jobPart.findFirstOrThrow({
        where: { id: jobPartId, companyId: scope.companyId },
      });
      return this.list(scope, p, jp.jobId);
    }
    return this.step(scope, p, jobPartId, ctx, async (tx, jp, job) => {
      if (jp.status !== 'reserved') throw conflict(`This part is ${jp.status}`);
      if (!ISSUE_STATUSES.includes(job.status))
        throw conflict('Parts are issued once the customer authorised the work, before the quality check');
      const mv = await applyMovement(
        tx,
        { ...ctx, actorUserId: p.userId },
        {
          companyId: scope.companyId,
          branchId: job.branchId,
          partId: jp.partId,
          idempotencyKey: input.idempotencyKey,
          jobId: job.id,
        },
        (level, acc) => {
          if (!acc.cogs)
            throw unprocessable(
              'The accountant must choose the cost of parts sold account first (Posting accounts)',
            );
          if (jp.quantity.greaterThan(level.onHand))
            throw unprocessable(`Only ${level.onHand.toFixed(3)} of ${jp.part.sku} on hand`);
          const c = stockOut(level, jp.quantity);
          return {
            kind: 'issue',
            quantity: jp.quantity,
            unitCost: c.unitCost,
            value: c.movementValue,
            after: c.after,
            debit: acc.cogs,
            credit: acc.inventory,
            reference: job.number,
          };
        },
      );
      await tx.jobPart.update({
        where: { id: jp.id },
        data: { status: 'issued', cost: mv.value, issueMovementId: mv.id },
      });
      await this.event(
        tx,
        job,
        p.userId,
        'part_issued',
        `${jp.part.sku} × ${jp.quantity.toFixed(3)} · ${mv.number}`,
      );
      return 'workshop.part.issue';
    });
  }

  async returnToStock(
    scope: CompanyScope,
    p: Principal,
    jobPartId: string,
    input: JobPartStepInput,
    ctx: AuditContext,
  ) {
    if (
      await this.prisma.stockMovement.findUnique({
        where: {
          companyId_idempotencyKey: { companyId: scope.companyId, idempotencyKey: input.idempotencyKey },
        },
      })
    ) {
      const jp = await this.prisma.jobPart.findFirstOrThrow({
        where: { id: jobPartId, companyId: scope.companyId },
      });
      return this.list(scope, p, jp.jobId);
    }
    return this.step(scope, p, jobPartId, ctx, async (tx, jp, job) => {
      if (jp.status !== 'issued') throw conflict(`This part is ${jp.status}`);
      if (!OPEN_STATUSES.includes(job.status)) throw conflict(`The job is ${job.status}`);
      const cost = jp.cost!;
      const mv = await applyMovement(
        tx,
        { ...ctx, actorUserId: p.userId },
        {
          companyId: scope.companyId,
          branchId: job.branchId,
          partId: jp.partId,
          idempotencyKey: input.idempotencyKey,
          jobId: job.id,
        },
        (level, acc) => {
          if (!acc.cogs)
            throw unprocessable(
              'The accountant must choose the cost of parts sold account first (Posting accounts)',
            );
          // Back in at exactly the value it went out at.
          return {
            kind: 'return',
            quantity: jp.quantity,
            unitCost: cost.div(jp.quantity).toDecimalPlaces(4, D.ROUND_HALF_UP),
            value: cost,
            after: { onHand: level.onHand.plus(jp.quantity), value: level.value.plus(cost) },
            debit: acc.inventory,
            credit: acc.cogs,
            reference: job.number,
          };
        },
      );
      await tx.jobPart.update({
        where: { id: jp.id },
        data: { status: 'returned', returnMovementId: mv.id },
      });
      await this.event(
        tx,
        job,
        p.userId,
        'part_returned',
        `${jp.part.sku} × ${jp.quantity.toFixed(3)} · ${mv.number}`,
      );
      return 'workshop.part.return';
    });
  }
}
