import { createTranslator, isLocale } from '@erp/localization';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { AppShell, type NavItem } from '@/components/AppShell';
import { ProblemNotice } from '@/components/ProblemNotice';
import { companyName, loadCompany } from '@/lib/context';

export const dynamic = 'force-dynamic';

export default async function CompanyLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string; companyId: string }>;
}) {
  const { locale, companyId } = await params;
  if (!isLocale(locale)) notFound();
  const t = createTranslator(locale);
  const ctx = await loadCompany(companyId);
  if (!ctx.ok) {
    return (
      <AppShell locale={locale} title={t('app.erp.name')} titleHref={`/${locale}`}>
        <ProblemNotice result={ctx} locale={locale} />
      </AppShell>
    );
  }
  const base = `/${locale}/c/${companyId}`;
  const items: (NavItem & { permission: string })[] = [
    { href: base, label: t('nav.overview'), permission: 'org.company.read' },
    { href: `${base}/journals`, label: t('nav.journals'), permission: 'accounting.journal.read' },
    { href: `${base}/accounts`, label: t('nav.accounts'), permission: 'accounting.account.read' },
    { href: `${base}/periods`, label: t('nav.periods'), permission: 'accounting.period.read' },
    { href: `${base}/branches`, label: t('nav.branches'), permission: 'org.branch.read' },
    { href: `${base}/audit`, label: t('nav.audit'), permission: 'audit.read' },
  ];
  return (
    <AppShell
      locale={locale}
      title={companyName(ctx.data.company, locale)}
      titleHref={base}
      userLabel={ctx.data.me.user.displayName}
      nav={items.filter((i) => ctx.data.can(i.permission))}
    >
      {children}
    </AppShell>
  );
}
