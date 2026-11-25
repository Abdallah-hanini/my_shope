import { DEFAULT_LOCALE, isLocale, resolveLocale, type Locale } from '@erp/localization';

/**
 * Picks the best supported locale from an Accept-Language header, honoring q-values.
 * Used only to choose the initial redirect; the URL segment is the source of truth afterwards.
 */
export function negotiateLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  const ranked = acceptLanguage
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
      return { tag: (tag ?? '').trim(), q: q ? Number(q.slice(2)) : 1 };
    })
    .filter((x) => x.tag && Number.isFinite(x.q) && x.q > 0)
    .sort((a, b) => b.q - a.q);
  for (const { tag } of ranked) {
    const base = tag.toLowerCase().split(/[-_]/)[0];
    if (isLocale(base)) return resolveLocale(base);
  }
  return DEFAULT_LOCALE;
}
