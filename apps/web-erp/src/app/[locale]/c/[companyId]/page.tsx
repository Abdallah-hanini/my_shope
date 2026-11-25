import { createTranslator, isLocale } from '@erp/localization';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/ui';
import { companyName, loadCompany } from '@/lib/context';
import { Ltr } from '@/components/ui';

export default async function CompanyOverview({
  params,
}: {
  params: Promise<{ locale: string; companyId: string }>;
}) {
  const { locale, companyId } = await params;
  if (!isLocale(locale)) notFound();
  const t = createTranslator(locale);
  const ctx = await loadCompany(companyId);
  if (!ctx.ok) return null; // layout renders the problem
  const { company, can } = ctx.data;
  const base = `/${locale}/c/${companyId}`;
  const areas = [
    { href: `${base}/journals`, label: t('nav.journals'), p: 'accounting.journal.read' },
    { href: `${base}/accounts`, label: t('nav.accounts'), p: 'accounting.account.read' },
    { href: `${base}/periods`, label: t('nav.periods'), p: 'accounting.period.read' },
    { href: `${base}/branches`, label: t('nav.branches'), p: 'org.branch.read' },
    { href: `${base}/audit`, label: t('nav.audit'), p: 'audit.read' },
  ].filter((a) => can(a.p));
  return (
    <>
      <PageHeader title={companyName(company, locale)}>
        <Ltr>{company.code}</Ltr> · <Ltr>{company.baseCurrency}</Ltr> · <Ltr>{company.timezone}</Ltr>
      </PageHeader>
      <p className="mb-4">{t('overview.intro')}</p>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {areas.map((a) => (
          <li key={a.href}>
            <Link
              href={a.href}
              className="flex min-h-16 items-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 font-semibold"
            >
              {a.label}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
