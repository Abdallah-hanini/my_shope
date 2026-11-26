import { unwrap } from '@erp/api-client';
import { createTranslator, isLocale } from '@erp/localization';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProblemNotice } from '@/components/ProblemNotice';
import { Card, Notice, PageHeader } from '@/components/ui';
import { JobForm } from '@/components/workshop/JobForm';
import { attempt } from '@/lib/api';
import { loadCompany, localName } from '@/lib/context';
import { createJobAction } from '../../workshop-actions';

/** WEB-014 Vehicle check-in: opens a job card. */
export default async function NewJobPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; companyId: string }>;
  searchParams: Promise<{ vehicle?: string }>;
}) {
  const { locale, companyId } = await params;
  const vehicle = (await searchParams).vehicle;
  if (!isLocale(locale)) notFound();
  const t = createTranslator(locale);
  const ctx = await loadCompany(companyId);
  if (!ctx.ok) return null;
  const { api, company, me } = ctx.data;
  const path = { params: { path: { companyId } } };
  const [vehicles, branches] = await Promise.all([
    attempt(async () => unwrap(await api.GET('/api/v1/companies/{companyId}/vehicles', path))),
    attempt(async () => unwrap(await api.GET('/api/v1/companies/{companyId}/branches', path))),
  ]);
  if (!vehicles.ok) return <ProblemNotice result={vehicles} locale={locale} />;
  // Branches where this person may open jobs: all of them for company-wide roles, else their own.
  const mine = me.companies.find((c) => c.companyId === companyId)?.assignments ?? [];
  const companyWide = mine.some((a) => a.branchId === null);
  const branchList = branches.ok
    ? branches.data.filter(
        (b) => b.status === 'active' && (companyWide || mine.some((a) => a.branchId === b.id)),
      )
    : [];
  return (
    <>
      <PageHeader title={t('job.new')}>{t('job.notIncluded')}</PageHeader>
      {vehicles.data.length === 0 ? (
        <Notice>
          {t('job.noVehicles')}{' '}
          <Link href={`/${locale}/c/${companyId}/customers`} className="underline">
            {t('cust.title')}
          </Link>
        </Notice>
      ) : (
        <Card>
          <JobForm
            locale={locale}
            mode="create"
            action={createJobAction.bind(null, locale, companyId, company.timezone)}
            vehicles={vehicles.data.map((v) => ({
              id: v.id,
              label: `${v.plate} — ${v.make} ${v.model} (${v.customerName})`,
            }))}
            branches={branchList.map((b) => ({ id: b.id, label: `${b.code} — ${localName(b, locale)}` }))}
            defaults={{ vehicleId: vehicle }}
          />
        </Card>
      )}
    </>
  );
}
