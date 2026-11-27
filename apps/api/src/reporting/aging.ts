import { Prisma } from '@prisma/client';

/**
 * Aging buckets (docs/KPI_DICTIONARY.md, "Aging"). Receivables age from the invoice date (customer
 * invoices carry no due date); payables age by days past the supplier's due date ("current" = not
 * yet due). Days are whole calendar days between YYYY-MM-DD dates in the company's time zone.
 */
export const RECEIVABLE_BUCKETS = ['d0_30', 'd31_60', 'd61_90', 'd90plus'] as const;
export const PAYABLE_BUCKETS = ['current', 'd1_30', 'd31_60', 'd61_90', 'd90plus'] as const;
export type ReceivableBucket = (typeof RECEIVABLE_BUCKETS)[number];
export type PayableBucket = (typeof PAYABLE_BUCKETS)[number];

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Receivable bucket by age (days since the invoice date at the cut-off). */
export function receivableBucket(age: number): ReceivableBucket {
  if (age <= 30) return 'd0_30';
  if (age <= 60) return 'd31_60';
  if (age <= 90) return 'd61_90';
  return 'd90plus';
}

/** Payable bucket by days past due at the cut-off (0 or less = current). */
export function payableBucket(daysPastDue: number): PayableBucket {
  if (daysPastDue <= 0) return 'current';
  if (daysPastDue <= 30) return 'd1_30';
  if (daysPastDue <= 60) return 'd31_60';
  if (daysPastDue <= 90) return 'd61_90';
  return 'd90plus';
}

/** Empty totals for a bucket list, as exact decimals. */
export function zeroBuckets<B extends string>(keys: readonly B[]): Record<B, Prisma.Decimal> {
  return Object.fromEntries(keys.map((k) => [k, new Prisma.Decimal(0)])) as Record<B, Prisma.Decimal>;
}

/** The period of equal length that ends the day before `from` (for comparisons). */
export function previousPeriod(from: string, to: string): { from: string; to: string } {
  const len = daysBetween(from, to);
  const end = new Date(Date.parse(`${from}T00:00:00Z`) - 86_400_000);
  const start = new Date(end.getTime() - len * 86_400_000);
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

/** Change as a percentage with one decimal; null when the base is zero (undefined, never 0 %). */
export function changePercent(current: Prisma.Decimal, base: Prisma.Decimal): string | null {
  if (base.isZero()) return null;
  return current
    .minus(base)
    .dividedBy(base.abs())
    .times(100)
    .toDecimalPlaces(1, Prisma.Decimal.ROUND_HALF_UP)
    .toFixed(1);
}
