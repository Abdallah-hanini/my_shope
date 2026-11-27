import { unwrap } from '@erp/api-client';
import { createTranslator, formatDateTime, groupDigits, isLocale } from '@erp/localization';
import { notFound } from 'next/navigation';
import { ReportActions } from '@/components/reports/ReportActions';
import { ProblemNotice } from '@/components/ProblemNotice';
import { AsOfFilters, branchOptions, ResultRow, SectionRows } from '@/components/reports/Statements';
import { Badge, Card, Ltr, Notice, PageHeader, Table, th, thNum } from '@/components/ui';
import { attempt } from '@/lib/api';
import { loadCompany } from '@/lib/context';
import { asOfDate, query } from '@/lib/ledger';
import { requestExportAction } from '../../export-actions';

const UUID = /^[0-9a-f-]{36}$/i;

/** Balance sheet at a date (RPT-FIN-02): assets = liabilities + equity, checked. */
export default async function BalanceSheetPage({
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
        await api.GET('/api/v1/companies/{companyId}/reports/balance-sheet', {
          params: { path: { companyId }, query: { asOf, ...(branch ? { branchId: branch } : {}) } },
        }),
      ),
    ),
    branchOptions(api, can, companyId, locale),
  ]);
  const ledgerHref = can('accounting.journal.read')
    ? (accountId: string) =>
        `${base}/ledger${query({ account: accountId, from: `${asOf.slice(0, 4)}-01-01`, to: asOf, branch })}`
    : undefined;
  return (
    <>
      <PageHeader
        title={t('rpt.bs')}
        back={{ href: `${base}/reports`, label: t('rpt.center') }}
        actions={
          <ReportActions
            locale={locale}
            printLabel={t('rpt.print')}
            action={res.ok ? requestExportAction.bind(null, locale, companyId) : undefined}
            initial={{ kind: 'balance_sheet', to: asOf, branchId: branch }}
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
        action={`${base}/reports/balance-sheet`}
        timeZone={company.timezone}
        asOf={asOf}
        branch={branch}
        branches={branches}
      />
      {!res.ok ? (
        <ProblemNotice result={res} locale={locale} />
      ) : (
        <>
          <p className="mb-4" data-balanced={String(res.data.balanced)}>
            {res.data.balanced ? (
              <Badge tone="success">✓ {t('rpt.bsBalanced')}</Badge>
            ) : (
              <Badge tone="danger">
                {t('rpt.bsNotBalanced')} <Ltr>{groupDigits(res.data.difference)}</Ltr>
              </Badge>
            )}
          </p>
          {branch && !res.data.balanced ? <Notice tone="info">{t('rpt.bsBranchNote')}</Notice> : null}
          <Card flush>
            <Table caption={t('rpt.bs')}>
              <thead>
                <tr>
                  <th scope="col" className={th}>
                    {t('rpt.account')}
                  </th>
                  <th scope="col" className={thNum}>
                    {t('rpt.balance')}
                  </th>
                </tr>
              </thead>
              <tbody>
                <SectionRows
                  locale={locale}
                  title={t('rpt.assets')}
                  lines={res.data.assets.lines}
                  total={res.data.assets.total}
                  compare={false}
                  ledgerHref={ledgerHref}
                />
                <SectionRows
                  locale={locale}
                  title={t('rpt.liabilities')}
                  lines={res.data.liabilities.lines}
                  total={res.data.liabilities.total}
                  compare={false}
                  ledgerHref={ledgerHref}
                />
                <SectionRows
                  locale={locale}
                  title={t('rpt.equity')}
                  lines={res.data.equity.lines}
                  total={res.data.equity.total}
                  compare={false}
                  ledgerHref={ledgerHref}
                />
                <ResultRow
                  label={t('rpt.unclosedResult')}
                  amount={res.data.unclosedResult}
                  compare={false}
                  note={t('rpt.unclosedNote')}
                />
                <ResultRow
                  label={t('rpt.totalLE')}
                  amount={res.data.totalLiabilitiesAndEquity}
                  compare={false}
                  strong
                />
              </tbody>
            </Table>
          </Card>
        </>
      )}
    </>
  );
}
