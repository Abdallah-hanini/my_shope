import { Prisma } from '@prisma/client';
import { decimalPlaces, isPositiveMoney, minorUnits } from '@erp/validation';
import { unprocessable } from '../common/errors';

export const Decimal = Prisma.Decimal;
export type Decimal = Prisma.Decimal;

export interface LineAmounts {
  debit: string;
  credit: string;
}

/**
 * Validates journal amounts in the company currency and returns exact decimal totals.
 * Amounts with more decimals than the currency allows are rejected, never silently rounded.
 */
export function validateLines(lines: LineAmounts[], currency: string): { total: Decimal } {
  const scale = minorUnits(currency);
  let debit = new Decimal(0);
  let credit = new Decimal(0);
  lines.forEach((l, i) => {
    const d = isPositiveMoney(l.debit);
    const c = isPositiveMoney(l.credit);
    if (d === c) throw unprocessable(`lines.${i}: exactly one of debit or credit must be greater than zero`);
    for (const v of [l.debit, l.credit]) {
      if (decimalPlaces(v) > scale && isPositiveMoney(v.slice(v.indexOf('.') + 1 + scale))) {
        throw unprocessable(`lines.${i}: ${currency} amounts allow at most ${scale} decimal places`);
      }
    }
    debit = debit.plus(l.debit);
    credit = credit.plus(l.credit);
  });
  if (!debit.equals(credit)) {
    throw unprocessable(
      `Journal is not balanced: debit ${debit.toFixed(scale)} ≠ credit ${credit.toFixed(scale)}`,
    );
  }
  return { total: debit };
}

export function formatMoney(value: Decimal, currency: string): string {
  return value.toFixed(minorUnits(currency));
}
