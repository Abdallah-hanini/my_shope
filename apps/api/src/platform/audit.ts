import type { Prisma } from '@prisma/client';

export interface AuditContext {
  actorUserId: string | null;
  requestId?: string;
}

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId: string;
  companyId?: string | null;
  branchId?: string | null;
  reason?: string;
  before?: unknown;
  after?: unknown;
}

const SENSITIVE = /token|secret|password|authorization|cookie|card|cvv|iban/i;

/** Removes values of sensitive-looking keys before they are persisted in the audit trail. */
export function redact(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(redact);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === 'bigint') out[k] = v.toString();
    else out[k] = SENSITIVE.test(k) ? '[redacted]' : redact(v);
  }
  return out;
}

/** Writes an audit event inside the caller's transaction, so it commits or rolls back with the change. */
export async function writeAudit(
  tx: Prisma.TransactionClient,
  ctx: AuditContext,
  e: AuditEntry,
): Promise<void> {
  await tx.auditEvent.create({
    data: {
      actorUserId: ctx.actorUserId,
      requestId: ctx.requestId ?? null,
      companyId: e.companyId ?? null,
      branchId: e.branchId ?? null,
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId,
      reason: e.reason ?? null,
      before:
        e.before === undefined
          ? undefined
          : (redact(JSON.parse(JSON.stringify(e.before))) as Prisma.InputJsonValue),
      after:
        e.after === undefined
          ? undefined
          : (redact(JSON.parse(JSON.stringify(e.after))) as Prisma.InputJsonValue),
    },
  });
}
