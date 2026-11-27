/**
 * Text for matching what someone types against labels in either language: case-insensitive,
 * Arabic diacritics and tatweel removed, and common Arabic letter variants folded (أ إ آ → ا,
 * ى → ي, ة → ه), so "اعدادات" finds "إعدادات".
 */
export function normalizeSearch(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ًͯ-ٰٟـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim();
}
