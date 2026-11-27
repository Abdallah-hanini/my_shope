import { unwrap } from '@erp/api-client';
import { createTranslator, formatDateTime, isLocale, type MessageKey } from '@erp/localization';
import { notFound } from 'next/navigation';
import { ReportActions } from '@/components/reports/ReportActions';
import { ProblemNotice } from '@/components/ProblemNotice';
import { Amount, LedgerFilters } from '@/components/reports/LedgerParts';
import { branchOptions } from '@/components/reports/Statements';
import { Badge, Card, Ltr, Notice, PageHeader, Table, td, tdNum, th, thNum } from '@/components/ui';
import { attempt } from '@/lib/api';
import { loadCompany } from '@/lib/context';
import { ledgerRange } from '@/lib/ledger';
import { requestExportAction } from '../../export-actions';

const UUID = /^[0-9a-f-]{36}$/i;

/** Cash flow, direct method from the ledger (RPT-FIN-03). */
export default async function CashFlowPage({
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
        await api.GET('/api/v1/companies/{companyId}/reports/cash-flow', {
          params: { path: { companyId }, query: { from, to, ...(branch ? { branchId: branch } : {}) } },
        }),
      ),
    ),
    branchOptions(api, can, companyId, locale),
  ]);
  return (
    <>
      <PageHeader
        title={t('rpt.cashFlow')}
        back={{ href: `${base}/reports`, label: t('rpt.center') }}
        actions={
          <ReportActions
            locale={locale}
            printLabel={t('rpt.print')}
            action={res.ok ? requestExportAction.bind(null, locale, companyId) : undefined}
            initial={{ kind: 'cash_flow', from, to, branchId: branch }}
          />
        }
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
        action={`${base}/reports/cash-flow`}
        timeZone={company.timezone}
        from={from}
        to={to}
        branch={branch}
        branches={branches}
      />
      {!res.ok ? (
        <ProblemNotice result={res} locale={locale} />
      ) : !res.data.configured ? (
        <Notice>{t('rpt.noCashAccounts')}</Notice>
      ) : (
        <>
          <p className="mb-4" data-reconciled={String(res.data.reconciled)}>
            {res.data.reconciled ? (
              <Badge tone="success">✓ {t('rpt.cashReconciled')}</Badge>
            ) : (
              <Badge tone="danger">{t('rpt.notReconciled')}</Badge>
            )}
          </p>
          <Card flush>
            <Table caption={t('rpt.cashFlow')}>
              <thead>
                <tr>
                  <th scope="col" className={th}>
                    {t('rpt.source')}
                  </th>
                  <th scope="col" className={thNum}>
                    {t('rpt.moneyIn')}
                  </th>
                  <th scope="col" className={thNum}>
                    {t('rpt.moneyOut')}
                  </th>
                  <th scope="col" className={thNum}>
                    {t('rpt.net')}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="font-semibold" data-result="opening">
                  <td className={td}>{t('rpt.openingCash')}</td>
                  <td className={tdNum} />
                  <td className={tdNum} />
                  <td className={tdNum}>
                    <Amount value={res.data.opening} />
                  </td>
                </tr>
                {res.data.categories.map((c) => (
                  <tr key={c.key} data-category={c.key}>
                    <td className={`${td} ps-8`}>
                      {t(`rpt.cf.${c.key}` as MessageKey)}
                      <span className="ms-2 text-xs text-[var(--color-text-muted)]">
                        {t('rpt.journalsN').replace('{n}', String(c.journals))}
                      </span>
                    </td>
                    <td className={tdNum}>
                      <Amount value={c.inflow} />
                    </td>
                    <td className={tdNum}>
                      <Amount value={c.outflow} />
                    </td>
                    <td className={tdNum}>
                      <Amount value={c.net} />
                    </td>
                  </tr>
                ))}
                <tr className="bg-[var(--color-surface-muted)]/60 font-semibold">
                  <td className={td}>{t('rpt.netChange')}</td>
                  <td className={tdNum}>
                    <Amount value={res.data.inflow} />
                  </td>
                  <td className={tdNum}>
                    <Amount value={res.data.outflow} />
                  </td>
                  <td className={tdNum}>
                    <Amount value={res.data.net} />
                  </td>
                </tr>
                <tr className="bg-[var(--color-primary-soft)] font-semibold" data-result="closing">
                  <td className={td}>{t('rpt.closingCash')}</td>
                  <td className={tdNum} />
                  <td className={tdNum} />
                  <td className={tdNum}>
                    <Amount value={res.data.closing} />
                  </td>
                </tr>
              </tbody>
            </Table>
          </Card>
          <p className="text-xs text-[var(--color-text-muted)]">
            {t('rpt.cashNote')}
            {res.data.internalTransfers
              ? ` ${t('rpt.internalN').replace('{n}', String(res.data.internalTransfers))}`
              : ''}
          </p>
        </>
      )}
    </>
  );
}
