import type { Prisma } from '@prisma/client';

/**
 * Next document number for (company, type, series). The upsert row-locks the sequence until the
 * transaction ends, so concurrent postings serialize here and a rollback returns the number:
 * committed documents are gapless.
 */
export async function nextDocumentNumber(
  tx: Prisma.TransactionClient,
  companyId: string,
  docType: string,
  series: string,
): Promise<number> {
  const rows = await tx.$queryRaw<{ value: bigint }[]>`
    INSERT INTO platform.document_sequence (company_id, doc_type, series, next_value)
    VALUES (${companyId}::uuid, ${docType}, ${series}, 2)
    ON CONFLICT (company_id, doc_type, series)
    DO UPDATE SET next_value = platform.document_sequence.next_value + 1
    RETURNING next_value - 1 AS value`;
  const value = rows[0]?.value;
  if (value === undefined) throw new Error('document sequence returned no value');
  return Number(value);
}

export function formatDocumentNumber(prefix: string, series: string, value: number): string {
  return `${prefix}-${series}-${String(value).padStart(6, '0')}`;
}
