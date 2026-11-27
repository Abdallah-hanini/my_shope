import { unwrap } from '@erp/api-client';
import { createTranslator, formatDateTime, isLocale } from '@erp/localization';
import { notFound } from 'next/navigation';
import { PrintButton } from '@/components/PrintButton';
import { ProblemNotice } from '@/components/ProblemNotice';
import { LedgerFilters } from '@/components/reports/LedgerParts';
import { branchOptions, ResultRow, SectionRows } from '@/components/reports/Statements';
import { Card, Ltr, PageHeader, Table, th, thNum } from '@/components/ui';
import { attempt } from '@/lib/api';
import { loadCompany } from '@/lib/context';
import { ledgerRange, query } from '@/lib/ledger';

const UUID = /^[0-9a-f-]{36}$/i;

/** Profit and loss by account with the previous period of equal length (RPT-FIN-01). */
export default async function ProfitAndLossPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; companyId: string }>;
  searchParams: Promise<{ from?: string; to?: string; branch?: string; compare?: string }>;
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
  const compare = sp.compare !== 'none';
  const base = `/${locale}/c/${companyId}`;
  const [res, branches] = await Promise.all([
    attempt(async () =>
      unwrap(
        await api.GET('/api/v1/companies/{companyId}/reports/profit-and-loss', {
          params: {
            path: { companyId },
            query: {
              from,
              to,
              compare: compare ? 'previous' : 'none',
              ...(branch ? { branchId: branch } : {}),
            },
          },
        }),
      ),
    ),
    branchOptions(api, can, companyId, locale),
  ]);
  const ledgerHref = can('accounting.journal.read')
    ? (accountId: string) => `${base}/ledger${query({ account: accountId, from, to, branch })}`
    : undefined;
  return (
    <>
      <PageHeader
        title={t('rpt.pl')}
        back={{ href: `${base}/reports`, label: t('rpt.center') }}
        actions={<PrintButton label={t('rpt.print')} />}
      >
        {res.ok ? (
          <span>
            <Ltr>{`${res.data.from} – ${res.data.to}`}</Ltr>
            {res.data.previousFrom ? (
              <>
                {' · '}
                {t('rpt.comparedWith')} <Ltr>{`${res.data.previousFrom} – ${res.data.previousTo}`}</Ltr>
              </>
            ) : null}{' '}
            · {company.baseCurrency} · {t('dash.freshness')}{' '}
            <time dateTime={res.data.asOf}>{formatDateTime(locale, res.data.asOf, company.timezone)}</time>
          </span>
        ) : null}
      </PageHeader>
      <LedgerFilters
        locale={locale}
        action={`${base}/reports/profit-and-loss`}
        timeZone={company.timezone}
        from={from}
        to={to}
        branch={branch}
        branches={branches}
        keep={compare ? {} : { compare: 'none' }}
      >
        <label className="flex min-h-10 items-center gap-2 text-sm">
          <input type="checkbox" name="compare" value="none" defaultChecked={!compare} className="size-4" />
          {t('rpt.noCompare')}
        </label>
      </LedgerFilters>
      {!res.ok ? (
        <ProblemNotice result={res} locale={locale} />
      ) : (
        <Card flush>
          <Table caption={t('rpt.pl')}>
            <thead>
              <tr>
                <th scope="col" className={th}>
                  {t('rpt.account')}
                </th>
                <th scope="col" className={thNum}>
                  {t('rpt.thisPeriod')}
                </th>
                {compare ? (
                  <>
                    <th scope="col" className={thNum}>
                      {t('rpt.previousPeriod')}
                    </th>
                    <th scope="col" className={thNum}>
                      {t('rpt.change')}
                    </th>
                  </>
                ) : null}
              </tr>
            </thead>
            <tbody>
              <SectionRows
                locale={locale}
                title={t('rpt.revenue')}
                lines={res.data.revenue.lines}
                total={res.data.revenue.total}
                previousTotal={res.data.revenue.previousTotal}
                compare={compare}
                ledgerHref={ledgerHref}
              />
              <SectionRows
                locale={locale}
                title={t('rpt.costOfSales')}
                lines={res.data.costOfSales.lines}
                total={res.data.costOfSales.total}
                previousTotal={res.data.costOfSales.previousTotal}
                compare={compare}
                ledgerHref={ledgerHref}
                better="down"
              />
              <ResultRow
                label={t('rpt.grossProfit')}
                {...res.data.grossProfit}
                compare={compare}
                note={res.data.grossMarginPct ? `${t('rpt.margin')} ${res.data.grossMarginPct}%` : undefined}
              />
              <SectionRows
                locale={locale}
                title={t('rpt.operatingExpenses')}
                lines={res.data.operatingExpenses.lines}
                total={res.data.operatingExpenses.total}
                previousTotal={res.data.operatingExpenses.previousTotal}
                compare={compare}
                ledgerHref={ledgerHref}
                better="down"
              />
              <ResultRow label={t('rpt.netProfit')} {...res.data.netProfit} compare={compare} strong />
            </tbody>
          </Table>
        </Card>
      )}
      <p className="text-xs text-[var(--color-text-muted)]">{t('rpt.plNote')}</p>
    </>
  );
}
