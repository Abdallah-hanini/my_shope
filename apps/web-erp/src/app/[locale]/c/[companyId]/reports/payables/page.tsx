import { unwrap } from '@erp/api-client';
import { createTranslator, formatDateTime, isLocale, type MessageKey } from '@erp/localization';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ReportActions } from '@/components/reports/ReportActions';
import { ProblemNotice } from '@/components/ProblemNotice';
import { Amount } from '@/components/reports/LedgerParts';
import { AgingTable, AsOfFilters, branchOptions, Reconciliation } from '@/components/reports/Statements';
import { Card, EmptyState, Ltr, PageHeader, Table, td, tdNum, th, thNum } from '@/components/ui';
import { attempt } from '@/lib/api';
import { loadCompany } from '@/lib/context';
import { asOfDate } from '@/lib/ledger';
import { requestExportAction } from '../../export-actions';

const UUID = /^[0-9a-f-]{36}$/i;

/** Supplier payables by days past due, reconciled to the control account (RPT-FIN). */
export default async function PayablesAgingPage({
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
        await api.GET('/api/v1/companies/{companyId}/reports/payables-aging', {
          params: { path: { companyId }, query: { asOf, ...(branch ? { branchId: branch } : {}) } },
        }),
      ),
    ),
    branchOptions(api, can, companyId, locale),
  ]);
  const partyHref = can('purchasing.read') ? (id: string) => `${base}/suppliers/${id}` : undefined;
  return (
    <>
      <PageHeader
        title={t('rpt.ap')}
        back={{ href: `${base}/reports`, label: t('rpt.center') }}
        actions={
          <ReportActions
            locale={locale}
            printLabel={t('rpt.print')}
            action={res.ok ? requestExportAction.bind(null, locale, companyId) : undefined}
            initial={{ kind: 'payables_aging', to: asOf, branchId: branch }}
          />
        }
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
        action={`${base}/reports/payables`}
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
                  caption={t('rpt.ap')}
                  partyLabel={t('rpt.supplier')}
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
                        {t('rpt.supplier')}
                      </th>
                      <th scope="col" className={th}>
                        {t('rpt.docDate')}
                      </th>
                      <th scope="col" className={th}>
                        {t('pur.dueDate')}
                      </th>
                      <th scope="col" className={thNum}>
                        {t('rpt.daysPastDue')}
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
                          {can('purchasing.read') ? (
                            <Link
                              href={`${base}/supplier-bills/${d.id}`}
                              className="text-[var(--color-primary)] hover:underline"
                            >
                              <Ltr>{d.number}</Ltr>
                            </Link>
                          ) : (
                            <Ltr>{d.number}</Ltr>
                          )}
                        </td>
                        <td className={td}>{d.partyName}</td>
                        <td className={td}>
                          <Ltr>{d.date}</Ltr>
                        </td>
                        <td className={td}>
                          <Ltr>{d.dueDate}</Ltr>
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
