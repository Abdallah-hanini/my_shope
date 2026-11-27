import { unwrap } from '@erp/api-client';
import { createTranslator, formatDateTime, isLocale, type MessageKey } from '@erp/localization';
import { notFound } from 'next/navigation';
import { PrintButton } from '@/components/PrintButton';
import { ProblemNotice } from '@/components/ProblemNotice';
import { Amount } from '@/components/reports/LedgerParts';
import { AgingTable, AsOfFilters, branchOptions, Reconciliation } from '@/components/reports/Statements';
import { Card, EmptyState, Ltr, PageHeader, Table, td, tdNum, th, thNum } from '@/components/ui';
import { attempt } from '@/lib/api';
import { loadCompany } from '@/lib/context';
import { asOfDate } from '@/lib/ledger';

const UUID = /^[0-9a-f-]{36}$/i;

/** Customer receivables by age, reconciled to the control account (RPT-FIN). */
export default async function ReceivablesAgingPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; companyId: string }>;
  searchParams: Promise<{ asOf?: string; branch?: string }>;
}) {
  const { locale, companyId } = await params;
  if (!isLocale(locale)) notFound();
  const sp = await searchParams;
  const t = createTranslator(locale);
  const ctx = await loadCompany(companyId);
  if (!ctx.ok) return null;
  const { api, can, company } = ctx.data;
  const asOf = asOfDate(company.timezone, sp);
  const branch = sp.branch && UUID.test(sp.branch) ? sp.branch : undefined;
  const base = `/${locale}/c/${companyId}`;
  const [res, branches] = await Promise.all([
    attempt(async () =>
      unwrap(
        await api.GET('/api/v1/companies/{companyId}/reports/receivables-aging', {
          params: { path: { companyId }, query: { asOf, ...(branch ? { branchId: branch } : {}) } },
        }),
      ),
    ),
    branchOptions(api, can, companyId, locale),
  ]);
  const partyHref = can('crm.customer.read') ? (id: string) => `${base}/customers/${id}` : undefined;
  return (
    <>
      <PageHeader
        title={t('rpt.ar')}
        back={{ href: `${base}/reports`, label: t('rpt.center') }}
        actions={<PrintButton label={t('rpt.print')} />}
      >
        {res.ok ? (
          <span>
            {t('rpt.asOf')} <Ltr>{res.data.asOfDate}</Ltr> · {company.baseCurrency} · {t('dash.freshness')}{' '}
            <time dateTime={res.data.asOf}>{formatDateTime(locale, res.data.asOf, company.timezone)}</time>
          </span>
        ) : null}
      </PageHeader>
      <AsOfFilters
        locale={locale}
        action={`${base}/reports/receivables`}
        timeZone={company.timezone}
        asOf={asOf}
        branch={branch}
        branches={branches}
      />
      {!res.ok ? (
        <ProblemNotice result={res} locale={locale} />
      ) : (
        <>
          <Reconciliation
            locale={locale}
            reconciled={res.data.reconciled}
            documents={res.data.total}
            ledger={res.data.ledgerBalance ?? null}
            currency={company.baseCurrency}
          />
          {res.data.parties.length === 0 ? (
            <Card>
              <EmptyState>{t('rpt.nothingOpen')}</EmptyState>
            </Card>
          ) : (
            <>
              <Card title={t('rpt.byParty')} id="by-party" flush>
                <AgingTable
                  locale={locale}
                  caption={t('rpt.ar')}
                  partyLabel={t('rpt.customer')}
                  buckets={res.data.buckets}
                  parties={res.data.parties}
                  totals={res.data.totals}
                  total={res.data.total}
                  partyHref={partyHref}
                />
              </Card>
              <Card title={t('rpt.openDocuments')} id="documents" flush>
                <Table caption={t('rpt.openDocuments')}>
                  <thead>
                    <tr>
                      <th scope="col" className={th}>
                        {t('inv.number')}
                      </th>
                      <th scope="col" className={th}>
                        {t('rpt.customer')}
                      </th>
                      <th scope="col" className={th}>
                        {t('rpt.docDate')}
                      </th>
                      <th scope="col" className={thNum}>
                        {t('rpt.daysOld')}
                      </th>
                      <th scope="col" className={th}>
                        {t('rpt.bucketCol')}
                      </th>
                      <th scope="col" className={thNum}>
                        {t('pur.total')}
                      </th>
                      <th scope="col" className={thNum}>
                        {t('pur.balance')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {res.data.documents.map((d) => (
                      <tr key={d.id} data-doc={d.number}>
                        <td className={td}>
                          <Ltr>{d.number}</Ltr>
                        </td>
                        <td className={td}>{d.partyName}</td>
                        <td className={td}>
                          <Ltr>{d.date}</Ltr>
                        </td>
                        <td className={tdNum}>
                          <Ltr>{String(d.days)}</Ltr>
                        </td>
                        <td className={td}>{t(`rpt.bucket.${d.bucket}` as MessageKey)}</td>
                        <td className={tdNum}>
                          <Amount value={d.total} />
                        </td>
                        <td className={`${tdNum} font-semibold`}>
                          <Amount value={d.balance} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Card>
            </>
          )}
        </>
      )}
    </>
  );
}
