import { Prisma } from '@prisma/client';
import { postSystemJournal } from '../accounting/posting';
import { notFound, unprocessable } from '../common/errors';
import { writeAudit, type AuditContext } from '../platform/audit';
import { formatDocumentNumber, nextDocumentNumber } from '../platform/sequence';
import { localTime } from '../workshop/scheduling';
import type { StockLevel } from './stock-math';

type Tx = Prisma.TransactionClient;
const D = Prisma.Decimal;

export type MovementKind = 'receipt' | 'adjustment_in' | 'adjustment_out' | 'issue' | 'return';
export interface MovementPlan {
  kind: MovementKind;
  quantity: Prisma.Decimal;
  unitCost: Prisma.Decimal;
  value: Prisma.Decimal;
  after: StockLevel;
  debit: string;
  credit: string;
  reference?: string | null;
  reason?: string | null;
}
export interface PostingAccounts {
  inventory: string;
  goodsReceived: string | null;
  adjustment: string | null;
  cogs: string | null;
}

/**
 * One stock movement inside the caller's transaction (T-74/T-75): lock the branch's stock row,
 * let `plan` value the change from the locked level, post the journal, write the numbered movement
 * and then the new balance (the database accepts a balance change only with a movement of the
 * same transaction). Returns the movement id and its value.
 */
export async function applyMovement(
  tx: Tx,
  ctx: AuditContext & { actorUserId: string },
  m: {
    companyId: string;
    branchId: string;
    partId: string;
    idempotencyKey: string;
    jobId?: string | null;
    supplierId?: string | null;
  },
  plan: (level: StockLevel, acc: PostingAccounts) => MovementPlan,
): Promise<{ id: string; number: string; value: Prisma.Decimal }> {
  const part = await tx.part.findUnique({
    where: { companyId_id: { companyId: m.companyId, id: m.partId } },
  });
  if (!part) throw notFound('Part');
  const settings = await tx.postingSettings.findUnique({ where: { companyId: m.companyId } });
  if (!settings?.inventoryAccountId)
    throw unprocessable('The accountant must choose the inventory account first (Posting accounts)');
  await tx.$executeRaw`INSERT INTO inventory.stock (company_id, branch_id, part_id) VALUES (${m.companyId}::uuid, ${m.branchId}::uuid, ${m.partId}::uuid) ON CONFLICT DO NOTHING`;
  const [row] = await tx.$queryRaw<{ on_hand: Prisma.Decimal; value: Prisma.Decimal }[]>`
    SELECT on_hand, value FROM inventory.stock WHERE branch_id = ${m.branchId}::uuid AND part_id = ${m.partId}::uuid FOR UPDATE`;
  const p = plan(
    { onHand: new D(row!.on_hand), value: new D(row!.value) },
    {
      inventory: settings.inventoryAccountId,
      goodsReceived: settings.goodsReceivedAccountId,
      adjustment: settings.stockAdjustmentAccountId,
      cogs: settings.cogsAccountId,
    },
  );
  if (p.value.isZero())
    throw unprocessable('The value of this movement rounds to 0.00; check the quantity and cost');
  const company = await tx.company.findUniqueOrThrow({ where: { id: m.companyId } });
  const today = localTime(new Date(), company.timezone).date;
  const year = today.slice(0, 4);
  const number = formatDocumentNumber(
    'SM',
    year,
    await nextDocumentNumber(tx, m.companyId, 'stock_movement', year),
  );
  const id = (await tx.$queryRaw<{ id: string }[]>`SELECT gen_random_uuid()::text AS id`)[0]!.id;
  const label = `${number} · ${part.sku} · ${p.kind.replace('_', ' ')} ${p.quantity.toFixed(3)}`;
  const journal = await postSystemJournal(tx, ctx, {
    companyId: m.companyId,
    branchId: m.branchId,
    postingDate: today,
    description: `${label}${p.reference ? ` · ${p.reference}` : ''}${p.reason ? ` · ${p.reason}` : ''}`,
    currency: company.baseCurrency,
    sourceType: 'stock',
    sourceId: id,
    lines: [
      { accountId: p.debit, debit: p.value, credit: new D(0), description: label },
      { accountId: p.credit, debit: new D(0), credit: p.value, description: label },
    ],
  });
  await tx.stockMovement.create({
    data: {
      id,
      companyId: m.companyId,
      branchId: m.branchId,
      partId: m.partId,
      number,
      kind: p.kind,
      jobId: m.jobId ?? null,
      supplierId: m.supplierId ?? null,
      quantity: p.quantity,
      unitCost: p.unitCost,
      value: p.value,
      onHandAfter: p.after.onHand,
      valueAfter: p.after.value,
      reference: p.reference ?? null,
      reason: p.reason ?? null,
      idempotencyKey: m.idempotencyKey,
      journalId: journal.id,
      createdBy: ctx.actorUserId,
    },
  });
  await tx.$executeRaw`UPDATE inventory.stock SET on_hand = ${p.after.onHand}, value = ${p.after.value}, updated_at = now()
                        WHERE branch_id = ${m.branchId}::uuid AND part_id = ${m.partId}::uuid`;
  await writeAudit(tx, ctx, {
    action: `inventory.stock.${p.kind}`,
    entityType: 'stock_movement',
    entityId: id,
    companyId: m.companyId,
    branchId: m.branchId,
    reason: p.reason ?? undefined,
    after: {
      number,
      sku: part.sku,
      quantity: p.quantity.toFixed(3),
      value: p.value.toFixed(2),
      journal: journal.number,
    },
  });
  return { id, number, value: p.value };
}
