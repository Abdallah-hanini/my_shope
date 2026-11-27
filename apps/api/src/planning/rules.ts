import { Prisma } from '@prisma/client';

const D = Prisma.Decimal;
type Dec = Prisma.Decimal;

/**
 * Stock position against a reorder point (docs/KPI_DICTIONARY.md, "Low stock"):
 * available = on hand − reserved for jobs; "out" when available ≤ 0, "low" when available ≤ min,
 * else "ok". Suggested order (when out or low) = max(reorder quantity, min − available).
 */
export function stockPosition(
  onHand: Dec,
  reserved: Dec,
  minQuantity: Dec,
  reorderQuantity: Dec,
): { available: Dec; status: 'out' | 'low' | 'ok'; suggested: Dec } {
  const available = onHand.minus(reserved);
  const status = available.lessThanOrEqualTo(0)
    ? 'out'
    : available.lessThanOrEqualTo(minQuantity)
      ? 'low'
      : 'ok';
  const gap = minQuantity.minus(available);
  const suggested = status === 'ok' ? new D(0) : D.max(reorderQuantity, gap);
  return { available, status, suggested };
}

/** Days in a month (1–12) of a year. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Where sales should be by now if the month's target is reached evenly (docs/KPI_DICTIONARY.md,
 * "Target pace"): target × days elapsed (today included) ÷ days in the month, to 2 decimals.
 */
export function expectedByNow(target: Dec, day: number, days: number): Dec {
  return target.times(day).dividedBy(days).toDecimalPlaces(2, D.ROUND_HALF_UP);
}
