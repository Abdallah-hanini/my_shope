import { Prisma } from '@prisma/client';

/**
 * Central KPI formulas (docs/KPI_DICTIONARY.md). Inputs are exact decimals aggregated from
 * reporting.ledger_line; nothing here uses floating point.
 */
export interface LedgerSums {
  revenue: Prisma.Decimal;
  cogs: Prisma.Decimal;
  operatingExpenses: Prisma.Decimal;
}

export function grossProfit(s: LedgerSums): Prisma.Decimal {
  return s.revenue.minus(s.cogs);
}

export function netProfit(s: LedgerSums): Prisma.Decimal {
  return s.revenue.minus(s.cogs).minus(s.operatingExpenses);
}

/** Percentage with one decimal; null when revenue is zero (undefined ratio, never shown as 0%). */
export function grossMarginPercent(s: LedgerSums): string | null {
  if (s.revenue.isZero()) return null;
  return grossProfit(s)
    .dividedBy(s.revenue)
    .times(100)
    .toDecimalPlaces(1, Prisma.Decimal.ROUND_HALF_UP)
    .toFixed(1);
}

/** All calendar months from..to inclusive as YYYY-MM. */
export function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.split('-').map(Number) as [number, number];
  const [ty, tm] = to.split('-').map(Number) as [number, number];
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/** Last calendar day of a YYYY-MM month as YYYY-MM-DD. */
export function lastDayOfMonth(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}
