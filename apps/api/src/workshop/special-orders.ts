import { Prisma } from '@prisma/client';
import { writeAudit, type AuditContext } from '../platform/audit';
import { enqueueOutbox } from '../platform/outbox';

type Tx = Prisma.TransactionClient;
const D = Prisma.Decimal;

/**
 * Special orders waiting for a part at a branch take newly received stock (T-77), oldest first:
 * each order that fits in what is now available (on hand − reservations) becomes a reservation for
 * its job; the first one that does not fit stops the round, so a large early order is not
 * overtaken by later small ones. Runs inside the receipt's transaction, after the stock row was
 * locked and increased; orders someone else is handling right now are skipped (no waiting).
 * Returns the number of orders reserved.
 */
export async function allocateArrivals(
  tx: Tx,
  ctx: AuditContext & { actorUserId: string },
  at: { companyId: string; branchId: string; partId: string; receipt: string },
): Promise<number> {
  const waiting = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM workshop.job_part
     WHERE branch_id = ${at.branchId}::uuid AND part_id = ${at.partId}::uuid AND status = 'ordered'
     ORDER BY ordered_at, id
     FOR UPDATE SKIP LOCKED`;
  if (!waiting.length) return 0;
  const [stock, reserved] = await Promise.all([
    tx.stock.findUnique({ where: { branchId_partId: { branchId: at.branchId, partId: at.partId } } }),
    tx.jobPart.aggregate({
      where: { branchId: at.branchId, partId: at.partId, status: 'reserved' },
      _sum: { quantity: true },
    }),
  ]);
  let free = new D(stock?.onHand ?? 0).minus(reserved._sum.quantity ?? 0);
  let count = 0;
  for (const { id } of waiting) {
    const jp = await tx.jobPart.findUniqueOrThrow({ where: { id }, include: { part: true } });
    if (jp.quantity.greaterThan(free)) break;
    await tx.jobPart.update({ where: { id }, data: { status: 'reserved', arrivedAt: new Date() } });
    free = free.minus(jp.quantity);
    count++;
    await tx.jobEvent.create({
      data: {
        companyId: at.companyId,
        jobId: jp.jobId,
        actorUserId: ctx.actorUserId,
        kind: 'part_arrived',
        note: `${jp.part.sku} × ${jp.quantity.toFixed(3)} · ${at.receipt}`,
      },
    });
    await writeAudit(tx, ctx, {
      action: 'workshop.part.arrived',
      entityType: 'job_part',
      entityId: id,
      companyId: at.companyId,
      branchId: at.branchId,
      after: { receipt: at.receipt },
    });
    await enqueueOutbox(tx, ctx, {
      companyId: at.companyId,
      aggregateType: 'job_card',
      aggregateId: jp.jobId,
      eventType: 'workshop.job.part_arrived',
      payload: { jobId: jp.jobId, jobPartId: id },
    });
  }
  return count;
}
