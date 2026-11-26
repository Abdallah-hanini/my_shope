import { createTranslator, isLocale } from '@erp/localization';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';
import { ProblemNotice } from '@/components/ProblemNotice';
import { companyName, loadCompany } from '@/lib/context';
import { companyNavigation } from '@/lib/navigation';

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
      <AppShell locale={locale} title={t('app.brand')} titleHref={`/${locale}`}>
        <ProblemNotice result={ctx} locale={locale} />
      </AppShell>
    );
  }
  const { company, me, can } = ctx.data;
  const name = companyName(company, locale);
  const base = `/${locale}/c/${companyId}`;
  const groups = companyNavigation(locale, companyId, can);
  return (
    <AppShell
      locale={locale}
      title={name}
      titleHref={base}
      user={{ name: me.user.displayName, email: me.user.email }}
      groups={groups}
      crumbs={[{ href: base, label: name }]}
      sectionBase={base}
      searchHref={`${base}/search`}
      companies={me.companies.map((c) => ({ id: c.companyId, name: companyName(c, locale), code: c.code }))}
      currentCompany={{ id: company.id, name }}
      canCreateCompany={me.user.isPlatformAdmin}
    >
      {children}
    </AppShell>
  );
}
