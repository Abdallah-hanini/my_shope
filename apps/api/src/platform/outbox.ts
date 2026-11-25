import type { Prisma } from '@prisma/client';

export interface OutboxMessage {
  companyId: string | null;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
}

/**
 * Transactional outbox: the event row commits atomically with the business change. Its UUID is the
 * event id consumers deduplicate on. The relay (worker) is delivered separately (P1-11).
 */
export async function enqueueOutbox(tx: Prisma.TransactionClient, m: OutboxMessage): Promise<void> {
  await tx.outboxEvent.create({
    data: {
      companyId: m.companyId,
      aggregateType: m.aggregateType,
      aggregateId: m.aggregateId,
      eventType: m.eventType,
      payload: m.payload as Prisma.InputJsonValue,
    },
  });
}
