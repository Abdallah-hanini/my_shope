import { createTranslator, getDirection, type Locale } from '@erp/localization';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { currentPath } from '@/lib/session';
import { SignOutButton } from './SignOutButton';

export interface NavItem {
  href: string;
  label: string;
}

/** Header, navigation and main landmark for signed-in pages. */
export async function AppShell({
  locale,
  title,
  titleHref,
  userLabel,
  nav = [],
  children,
}: {
  locale: Locale;
  title: string;
  titleHref: string;
  userLabel?: string;
  nav?: NavItem[];
  children: ReactNode;
}) {
  const t = createTranslator(locale);
  const other: Locale = locale === 'ar' ? 'en' : 'ar';
  const path = await currentPath();
  const switchHref = path.replace(/^\/(en|ar)(?=\/|$|\?)/, `/${other}`);
  const active = path.split('?')[0] ?? path;
  return (
    <div dir={getDirection(locale)} className="min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-10 focus:rounded focus:bg-[var(--color-surface)] focus:p-2"
      >
        {locale === 'ar' ? 'تخطي إلى المحتوى' : 'Skip to content'}
      </a>
      <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 flex-col">
            <Link href={`/${locale}`} className="text-sm text-[var(--color-text-muted)]">
              {t('app.erp.name')}
            </Link>
            <Link href={titleHref} className="truncate text-lg font-bold">
              {title}
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {userLabel ? (
              <span className="text-sm text-[var(--color-text-muted)]">
                {t('auth.signedInAs')} <bdi>{userLabel}</bdi>
              </span>
            ) : null}
            <Link
              href={switchHref}
              hrefLang={other}
              lang={other}
              className="inline-flex min-h-11 items-center rounded-lg border border-[var(--color-border)] px-3 font-semibold"
            >
              {t('common.switchLanguage')}
            </Link>
            {userLabel ? <SignOutButton locale={locale} /> : null}
          </div>
        </div>
        {nav.length ? (
          <nav aria-label={t('nav.mainLabel')} className="mx-auto max-w-6xl overflow-x-auto px-4">
            <ul className="flex gap-1">
              {nav.map((n) => {
                const current =
                  active === n.href || (n.href !== nav[0]?.href && active.startsWith(`${n.href}/`));
                return (
                  <li key={n.href}>
                    <Link
                      href={n.href}
                      aria-current={current ? 'page' : undefined}
                      className={`inline-flex min-h-11 items-center whitespace-nowrap border-b-2 px-3 ${
                        current ? 'border-[var(--color-primary)] font-semibold' : 'border-transparent'
                      }`}
                    >
                      {n.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        ) : null}
      </header>
      <main id="main" className="mx-auto max-w-6xl px-4 py-6">
        {children}
      </main>
    </div>
  );
}
