/**
 * Dated rates (tax and labour, D-05): a rate applies from its date until the next one. Dates are
 * local calendar dates (YYYY-MM-DD) in the company's time zone.
 */
export interface Dated {
  effectiveFrom: string;
}

/** The rate in force on `date`, or null when none has started yet. */
export function effectiveOn<T extends Dated>(rows: T[], date: string): T | null {
  let best: T | null = null;
  for (const r of rows)
    if (r.effectiveFrom <= date && (!best || r.effectiveFrom > best.effectiveFrom)) best = r;
  return best;
}

/** A Date from a DATE column as YYYY-MM-DD (Prisma returns DATE values at UTC midnight). */
export const isoDate = (d: Date) => d.toISOString().slice(0, 10);
