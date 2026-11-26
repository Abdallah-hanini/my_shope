import type { Prisma } from '@prisma/client';
import type { AuditContext } from './audit';

export interface OutboxMessage {
  companyId: string | null;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
}

/**
 * Transactional outbox: the event row commits atomically with the business change. Its UUID is the
 * event id consumers deduplicate on. The actor (who did it) is recorded with the event; the
 * dispatcher (platform/outbox-dispatcher.ts) delivers events to their consumers.
 */
export async function enqueueOutbox(
  tx: Prisma.TransactionClient,
  ctx: Pick<AuditContext, 'actorUserId'>,
  m: OutboxMessage,
): Promise<void> {
  await tx.outboxEvent.create({
    data: {
      actorUserId: ctx.actorUserId,
      companyId: m.companyId,
      aggregateType: m.aggregateType,
      aggregateId: m.aggregateId,
      eventType: m.eventType,
      payload: m.payload as Prisma.InputJsonValue,
    },
  });
}
