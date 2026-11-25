import { ar } from './messages/ar';
import { en } from './messages/en';
import { SUPPORTED_LOCALES, type Direction, type Locale, type MessageKey } from './types';

export * from './types';

export const DEFAULT_LOCALE: Locale = 'en';
export const catalogs: Record<Locale, Record<MessageKey, string>> = { en, ar };

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/** Resolves an arbitrary tag such as "ar-QA" or "en_US" to a supported locale. */
export function resolveLocale(tag: string | null | undefined): Locale {
  const base = (tag ?? '').toLowerCase().split(/[-_]/)[0];
  return isLocale(base) ? base : DEFAULT_LOCALE;
}

export function getDirection(locale: Locale): Direction {
  return locale === 'ar' ? 'rtl' : 'ltr';
}

export function translate(locale: Locale, key: MessageKey): string {
  return catalogs[locale][key];
}

export function createTranslator(locale: Locale) {
  return (key: MessageKey) => translate(locale, key);
}

/** Locale-aware date-time formatting. Business dates are stored in UTC and rendered in the viewer's zone. */
export function formatDateTime(locale: Locale, value: Date | string, timeZone?: string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'medium',
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}

/**
 * Adds thousands separators to an exact decimal string ("50000.00" → "50,000.00", "-1234.5" →
 * "-1,234.5") without converting to a number, so no value can lose precision. Digits stay
 * Western in both languages (docs/DECISIONS.md T-27).
 */
export function groupDigits(value: string): string {
  const m = /^(-?)(\d+)(\.\d+)?$/.exec(value.trim());
  if (!m) return value;
  const [, sign, int, frac = ''] = m;
  return `${sign}${(int as string).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${frac}`;
}
