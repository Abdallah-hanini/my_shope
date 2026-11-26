import { createTranslator, getDirection, type Locale } from '@erp/localization';
import Link from 'next/link';
import { Suspense, type ReactNode } from 'react';
import { sidebarCollapsed, themePreference } from '@/lib/preferences';
import { currentPath } from '@/lib/session';
import { Breadcrumbs, LanguageSwitch, type Crumb } from './shell/HeaderLinks';
import { HeaderSearch } from './shell/HeaderSearch';
import { CompanySwitcher, ProfileMenu } from './shell/Menus';
import { DesktopSidebar, MobileNav, type SidebarGroup } from './shell/Sidebar';

export type { Crumb };

/**
 * Application shell: role-filtered sidebar (desktop) / drawer (mobile), 64 px header with
 * breadcrumbs, company switcher, language and profile menus, and the main landmark.
 */
export async function AppShell({
  locale,
  title,
  titleHref,
  user,
  groups = [],
  crumbs = [],
  sectionBase,
  searchHref,
  companies = [],
  currentCompany,
  canCreateCompany = false,
  children,
}: {
  locale: Locale;
  title: string;
  titleHref: string;
  user?: { name: string; email?: string };
  groups?: SidebarGroup[];
  crumbs?: Crumb[];
  /** Company home path; the current section crumb is then derived from the URL. */
  sectionBase?: string;
  /** Company search page; shows the header search when set. */
  searchHref?: string;
  companies?: { id: string; name: string; code: string }[];
  currentCompany?: { id: string; name: string };
  canCreateCompany?: boolean;
  children: ReactNode;
}) {
  const t = createTranslator(locale);
  const other: Locale = locale === 'ar' ? 'en' : 'ar';
  const path = await currentPath();
  const switchHref = path.replace(/^\/(en|ar)(?=\/|$|\?)/, `/${other}`);
  const [collapsed, theme] = await Promise.all([sidebarCollapsed(), themePreference()]);
  const hasNav = groups.some((g) => g.items.length);
  const trail: Crumb[] = [{ href: `/${locale}`, label: t('common.home') }, ...crumbs];
  return (
    <div dir={getDirection(locale)} className="flex min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-50 focus:rounded focus:bg-[var(--color-surface)] focus:p-2"
      >
        {locale === 'ar' ? 'تخطي إلى المحتوى' : 'Skip to content'}
      </a>
      {hasNav ? (
        <DesktopSidebar
          locale={locale}
          groups={groups}
          initialCollapsed={collapsed}
          companyName={currentCompany?.name}
        />
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 print:hidden shrink-0 items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface)]/95 px-4 backdrop-blur sm:px-6">
          {hasNav ? <MobileNav locale={locale} groups={groups} companyName={currentCompany?.name} /> : null}
          {!hasNav ? (
            <Link href={`/${locale}`} className="flex items-center gap-2 font-bold" dir="ltr">
              <span className="rounded-md bg-[var(--color-sidebar)] px-2 py-1 text-xs tracking-wide text-white">
                AUTO360
              </span>
            </Link>
          ) : null}
          <Breadcrumbs locale={locale} trail={trail} sectionBase={sectionBase} groups={groups} />
          <div className="min-w-0 flex-1 truncate font-semibold md:hidden">
            <Link href={titleHref}>{title}</Link>
          </div>
          <div className="ms-auto flex items-center gap-2">
            {searchHref ? (
              <Suspense fallback={null}>
                <HeaderSearch locale={locale} action={searchHref} />
              </Suspense>
            ) : null}
            {user ? (
              <span className="hidden sm:block">
                <CompanySwitcher
                  locale={locale}
                  current={currentCompany}
                  companies={companies}
                  canCreate={canCreateCompany}
                />
              </span>
            ) : null}
            <Suspense
              fallback={
                <Link
                  href={switchHref}
                  hrefLang={other}
                  lang={other}
                  className="inline-flex min-h-10 items-center rounded-lg border border-[var(--color-border)] px-3 text-sm font-semibold"
                >
                  {t('common.switchLanguage')}
                </Link>
              }
            >
              <LanguageSwitch locale={locale} />
            </Suspense>
            {user ? <ProfileMenu locale={locale} name={user.name} email={user.email} theme={theme} /> : null}
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6">
          {/* On paper the header is hidden, so the company is named here instead. */}
          <p className="mb-2 hidden text-sm font-semibold print:block">{title}</p>
          {children}
        </main>
      </div>
    </div>
  );
}
