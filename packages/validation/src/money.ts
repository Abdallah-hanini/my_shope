import { z } from 'zod';

/**
 * ISO 4217 minor units for currencies the system accepts. Extend deliberately: an unknown currency
 * is rejected rather than guessed (D-07 decides which currencies are in scope).
 */
export const CURRENCY_MINOR_UNITS: Readonly<Record<string, number>> = Object.freeze({
  QAR: 2,
  SAR: 2,
  AED: 2,
  KWD: 3,
  BHD: 3,
  OMR: 3,
  JOD: 3,
  EGP: 2,
  USD: 2,
  EUR: 2,
  GBP: 2,
});

export function isSupportedCurrency(code: string): boolean {
  return Object.prototype.hasOwnProperty.call(CURRENCY_MINOR_UNITS, code);
}

export function minorUnits(code: string): number {
  const units = CURRENCY_MINOR_UNITS[code];
  if (units === undefined) throw new Error(`Unsupported currency ${code}`);
  return units;
}

/**
 * Money travels as a decimal string ("1250.50"), never as a JSON number, so no client or proxy can
 * introduce binary floating-point error. Up to 14 integer digits and 6 decimals fit NUMERIC(20,6).
 */
export const MONEY_PATTERN = /^(0|[1-9]\d{0,13})(\.\d{1,6})?$/;
export const moneyString = z
  .string({
    invalid_type_error: 'must be a decimal string, e.g. "125.50" (JSON numbers are not accepted for money)',
  })
  .regex(MONEY_PATTERN, 'must be a non-negative decimal string, e.g. "125.50"');

/** Number of decimal places written in a money string ("10.50" → 2, "10" → 0). */
export function decimalPlaces(value: string): number {
  const dot = value.indexOf('.');
  return dot === -1 ? 0 : value.length - dot - 1;
}

/** True when a money string is greater than zero, without converting to a float. */
export function isPositiveMoney(value: string): boolean {
  return /[1-9]/.test(value);
}
