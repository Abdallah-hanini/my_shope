import { Prisma } from '@prisma/client';
import { fromIsoDate } from '../common/dates';
import { unprocessable } from '../common/errors';
import { writeAudit, type AuditContext } from '../platform/audit';
import { enqueueOutbox } from '../platform/outbox';
import { formatDocumentNumber, nextDocumentNumber } from '../platform/sequence';

type Tx = Prisma.TransactionClient;

export interface SystemLine {
  accountId: string;
  debit: Prisma.Decimal;
  credit: Prisma.Decimal;
  description: string | null;
}

/**
 * Posts a journal produced by a business document (invoice, payment, credit note) inside the
 * caller's transaction, under the same rules as manual journals: an open fiscal period for the
 * date (locked FOR SHARE against a concurrent close), active posting accounts, balanced lines (the
 * database checks this at commit), gapless JV numbering, audit and outbox. The document id is the
 * journal's source and idempotency key, so a document posts at most once.
 */
export async function postSystemJournal(
  tx: Tx,
  ctx: AuditContext & { actorUserId: string },
  j: {
    companyId: string;
    branchId: string;
    postingDate: string;
    description: string;
    currency: string;
    sourceType: 'invoice' | 'payment' | 'reversal';
    sourceId: string;
    reversalOfId?: string;
    lines: SystemLine[];
  },
): Promise<{ id: string; number: string }> {
  const periods = await tx.$queryRaw<{ id: string; status: string; name: string }[]>`
    SELECT id, status::text AS status, name FROM accounting.fiscal_period
     WHERE company_id = ${j.companyId}::uuid AND ${j.postingDate}::date BETWEEN start_date AND end_date
     FOR SHARE`;
  const period = periods[0];
  if (!period)
    throw unprocessable(`No fiscal period contains ${j.postingDate}; the accountant must open one`);
  if (period.status !== 'open') throw unprocessable(`Fiscal period ${period.name} is closed`);
  const lines = j.lines.filter((l) => !l.debit.isZero() || !l.credit.isZero());
  const ids = [...new Set(lines.map((l) => l.accountId))];
  const accounts = await tx.account.findMany({ where: { companyId: j.companyId, id: { in: ids } } });
  if (accounts.length !== ids.length || accounts.some((a) => !a.isPosting || a.status !== 'active'))
    throw unprocessable(
      'A posting account is missing, a header or inactive; the accountant must fix the posting settings',
    );
  const total = lines.reduce((s, l) => s.plus(l.debit), new Prisma.Decimal(0));
  const series = j.postingDate.slice(0, 4);
  const seq = await nextDocumentNumber(tx, j.companyId, 'JV', series);
  const journal = await tx.journal.create({
    data: {
      companyId: j.companyId,
      branchId: j.branchId,
      fiscalPeriodId: period.id,
      number: formatDocumentNumber('JV', series, seq),
      postingDate: fromIsoDate(j.postingDate),
      description: j.description,
      currency: j.currency,
      totalDebit: total,
      totalCredit: total,
      sourceType: j.sourceType,
      sourceId: j.sourceId,
      reversalOfId: j.reversalOfId ?? null,
      idempotencyKey: `${j.sourceType}:${j.sourceId}`,
      requestHash: `${j.sourceType}:${j.sourceId}`,
      postedBy: ctx.actorUserId,
    },
  });
  await tx.journalLine.createMany({
    data: lines.map((l, i) => ({
      companyId: j.companyId,
      journalId: journal.id,
      lineNo: i + 1,
      accountId: l.accountId,
      branchId: j.branchId,
      description: l.description,
      debit: l.debit,
      credit: l.credit,
    })),
  });
  await writeAudit(tx, ctx, {
    action: j.sourceType === 'reversal' ? 'accounting.journal.reverse' : 'accounting.journal.post',
    entityType: 'journal',
    entityId: journal.id,
    companyId: j.companyId,
    branchId: j.branchId,
    after: {
      number: journal.number,
      postingDate: j.postingDate,
      total: total.toString(),
      source: `${j.sourceType}:${j.sourceId}`,
    },
  });
  await enqueueOutbox(tx, ctx, {
    companyId: j.companyId,
    aggregateType: 'journal',
    aggregateId: journal.id,
    eventType: j.sourceType === 'reversal' ? 'accounting.journal.reversed' : 'accounting.journal.posted',
    payload: { journalId: journal.id, number: journal.number, reversalOfId: j.reversalOfId ?? null },
  });
  return { id: journal.id, number: journal.number };
}
