import { unwrap } from '@erp/api-client';
import { createTranslator, formatDateTime, isLocale } from '@erp/localization';
import { Repeat, UserCheck, UserPlus, Users } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { PrintButton } from '@/components/PrintButton';
import { ProblemNotice } from '@/components/ProblemNotice';
import { Amount, LedgerFilters } from '@/components/reports/LedgerParts';
import { branchOptions } from '@/components/reports/Statements';
import { Badge, Card, EmptyState, Ltr, PageHeader, Table, td, tdNum, th, thNum } from '@/components/ui';
import { attempt } from '@/lib/api';
import { loadCompany } from '@/lib/context';
import { ledgerRange } from '@/lib/ledger';

const UUID = /^[0-9a-f-]{36}$/i;

/** Customers (RPT-CRM-01): new, active, returning, top customers by sales. */
export default async function CustomersReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; companyId: string }>;
  searchParams: Promise<{ from?: string; to?: string; branch?: string }>;
}) {
  const { locale, companyId } = await params;
  if (!isLocale(locale)) notFound();
  const sp = await searchParams;
  const t = createTranslator(locale);
  const ctx = await loadCompany(companyId);
  if (!ctx.ok) return null;
  const { api, can, company } = ctx.data;
  const { from, to } = ledgerRange(company.timezone, sp);
  const branch = sp.branch && UUID.test(sp.branch) ? sp.branch : undefined;
  const base = `/${locale}/c/${companyId}`;
  const [res, branches] = await Promise.all([
    attempt(async () =>
      unwrap(
        await api.GET('/api/v1/companies/{companyId}/reports/customers', {
          params: { path: { companyId }, query: { from, to, ...(branch ? { branchId: branch } : {}) } },
        }),
      ),
    ),
    branchOptions(api, can, companyId, locale),
  ]);
  return (
    <>
      <PageHeader
        title={t('rpt.customers')}
        back={{ href: `${base}/reports`, label: t('rpt.center') }}
        actions={<PrintButton label={t('rpt.print')} />}
      >
        {res.ok ? (
          <span>
            <Ltr>{`${from} – ${to}`}</Ltr> · {company.baseCurrency} · {t('dash.freshness')}{' '}
            <time dateTime={res.data.asOf}>{formatDateTime(locale, res.data.asOf, company.timezone)}</time>
          </span>
        ) : null}
      </PageHeader>
      <LedgerFilters
        locale={locale}
        action={`${base}/reports/customers`}
        timeZone={company.timezone}
        from={from}
        to={to}
        branch={branch}
        branches={branches}
      />
      {!res.ok ? (
        <ProblemNotice result={res} locale={locale} />
      ) : (
        <>
          <section
            aria-label={t('rpt.customers')}
            className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
          >
            <KpiCard label={t('rpt.totalCustomers')} value={String(res.data.totalCustomers)} icon={Users} />
            <KpiCard label={t('rpt.newCustomers')} value={String(res.data.newCustomers)} icon={UserPlus} />
            <KpiCard
              label={t('rpt.activeCustomers')}
              value={String(res.data.activeCustomers)}
              icon={UserCheck}
              sub={t('rpt.activeHelp')}
            />
            <KpiCard
              label={t('rpt.returningCustomers')}
              value={String(res.data.returningCustomers)}
              icon={Repeat}
              sub={res.data.returningPct ? `${res.data.returningPct}% ${t('rpt.ofActive')}` : undefined}
            />
          </section>
          <Card title={t('rpt.topCustomers')} id="top-customers" flush>
            {res.data.topCustomers.length === 0 ? (
              <EmptyState>{t('rpt.nothing')}</EmptyState>
            ) : (
              <Table caption={t('rpt.topCustomers')}>
                <thead>
                  <tr>
                    <th scope="col" className={th}>
                      {t('rpt.customer')}
                    </th>
                    <th scope="col" className={thNum}>
                      {t('rpt.invoices')}
                    </th>
                    <th scope="col" className={th}>
                      {t('rpt.lastInvoice')}
                    </th>
                    <th scope="col" className={thNum}>
                      {t('rpt.salesExTax')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {res.data.topCustomers.map((c) => (
                    <tr key={c.customerId} data-customer={c.name}>
                      <td className={td}>
                        {can('crm.customer.read') ? (
                          <Link
                            href={`${base}/customers/${c.customerId}`}
                            className="text-[var(--color-primary)] hover:underline"
                          >
                            {c.name}
                          </Link>
                        ) : (
                          c.name
                        )}{' '}
                        {c.returning ? <Badge tone="info">{t('rpt.returning')}</Badge> : null}
                      </td>
                      <td className={tdNum}>{c.invoices}</td>
                      <td className={td}>
                        <Ltr>{c.lastInvoiceDate ?? '—'}</Ltr>
                      </td>
                      <td className={tdNum}>
                        <Amount value={c.sales} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
          <p className="text-xs text-[var(--color-text-muted)]">{t('rpt.customersNote')}</p>
        </>
      )}
    </>
  );
}
