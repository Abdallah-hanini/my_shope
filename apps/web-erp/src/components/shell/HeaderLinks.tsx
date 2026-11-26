'use client';

import { createTranslator, type Locale } from '@erp/localization';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { sectionFor } from '@/lib/navigation';
import type { SidebarGroup } from './Sidebar';

export interface Crumb {
  href: string;
  label: string;
}

/**
 * Breadcrumb trail. The section is derived from the current URL on the client, because layouts
 * are not re-rendered on in-app navigation (a server-computed section would go stale).
 */
export function Breadcrumbs({
  locale,
  trail,
  sectionBase,
  groups,
}: {
  locale: Locale;
  trail: Crumb[];
  /** Company home: when set, the matching navigation item is appended as the last crumb. */
  sectionBase?: string;
  groups: SidebarGroup[];
}) {
  const t = createTranslator(locale);
  const path = usePathname();
  const section =
    sectionBase && path !== sectionBase
      ? (sectionFor(groups, path, sectionBase) ??
        (path.startsWith(`${sectionBase}/search`)
          ? { href: `${sectionBase}/search`, label: t('search.title') }
          : undefined))
      : undefined;
  const all = section ? [...trail, section] : trail;
  return (
    <nav aria-label={t('nav.breadcrumb')} className="hidden min-w-0 flex-1 md:block">
      <ol className="flex items-center gap-1 text-sm text-[var(--color-text-muted)]">
        {all.map((c, i) => (
          <li key={`${c.href}-${i}`} className="flex min-w-0 items-center gap-1">
            {i > 0 ? <ChevronRight aria-hidden size={14} className="shrink-0 rtl:-scale-x-100" /> : null}
            {i === all.length - 1 ? (
              <span aria-current="page" className="truncate font-medium text-[var(--color-text)]">
                {c.label}
              </span>
            ) : (
              <Link href={c.href} className="truncate hover:text-[var(--color-text)]">
                {c.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Same page in the other language, including the query (filters), from the current URL. */
export function LanguageSwitch({ locale }: { locale: Locale }) {
  const t = createTranslator(locale);
  const other: Locale = locale === 'ar' ? 'en' : 'ar';
  const path = usePathname();
  const search = useSearchParams().toString();
  const href = `${path.replace(/^\/(en|ar)(?=\/|$)/, `/${other}`)}${search ? `?${search}` : ''}`;
  return (
    <Link
      href={href}
      hrefLang={other}
      lang={other}
      className="inline-flex min-h-10 items-center rounded-lg border border-[var(--color-border)] px-3 text-sm font-semibold"
    >
      {t('common.switchLanguage')}
    </Link>
  );
}
