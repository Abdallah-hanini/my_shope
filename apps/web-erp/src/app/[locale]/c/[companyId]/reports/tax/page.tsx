import { unwrap } from '@erp/api-client';
import { createTranslator, formatDateTime, groupDigits, isLocale } from '@erp/localization';
import { notFound } from 'next/navigation';
import { ReportActions } from '@/components/reports/ReportActions';
import { ProblemNotice } from '@/components/ProblemNotice';
import { Amount, LedgerFilters } from '@/components/reports/LedgerParts';
import { branchOptions } from '@/components/reports/Statements';
import { Badge, Card, EmptyState, Grid, Ltr, PageHeader, Table, td, tdNum, th, thNum } from '@/components/ui';
import { attempt } from '@/lib/api';
import { loadCompany } from '@/lib/context';
import { ledgerRange } from '@/lib/ledger';
import { requestExportAction } from '../../export-actions';

const UUID = /^[0-9a-f-]{36}$/i;

/** Tax summary by code (RPT-FIN-04): output on sales, input on purchases, checked to the ledger. */
export default async function TaxSummaryPage({
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
  const cur = company.baseCurrency;
  const [res, branches] = await Promise.all([
    attempt(async () =>
      unwrap(
        await api.GET('/api/v1/companies/{companyId}/reports/tax-summary', {
          params: { path: { companyId }, query: { from, to, ...(branch ? { branchId: branch } : {}) } },
        }),
      ),
    ),
    branchOptions(api, can, companyId, locale),
  ]);
  const side = (
    title: string,
    id: string,
    rows: { taxCode?: string | null; documents: number; taxable: string; tax: string }[],
    total: string,
    ledger: string | null | undefined,
    ok: boolean,
  ) => (
    <Card
      title={title}
      id={id}
      flush
      actions={
        <span data-reconciled={String(ok)}>
          {ok ? (
            <Badge tone="success">✓ {t('rpt.reconciled')}</Badge>
          ) : (
            <Badge tone="danger">{t('rpt.notReconciled')}</Badge>
          )}
        </span>
      }
    >
      {rows.length === 0 ? (
        <EmptyState>{t('rpt.nothing')}</EmptyState>
      ) : (
        <Table caption={title}>
          <thead>
            <tr>
              <th scope="col" className={th}>
                {t('rpt.taxCode')}
              </th>
              <th scope="col" className={thNum}>
                {t('rpt.documents')}
              </th>
              <th scope="col" className={thNum}>
                {t('rpt.taxable')}
              </th>
              <th scope="col" className={thNum}>
                {t('rpt.tax')}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.taxCode ?? '-'}>
                <td className={td}>{r.taxCode ? <Ltr>{r.taxCode}</Ltr> : t('rpt.noTax')}</td>
                <td className={tdNum}>{r.documents}</td>
                <td className={tdNum}>
                  <Amount value={r.taxable} />
                </td>
                <td className={tdNum}>
                  <Amount value={r.tax} />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <th scope="row" className={`${td} text-start`} colSpan={3}>
                {t('rpt.total')}
                {ledger != null ? (
                  <span className="ms-2 text-xs font-normal text-[var(--color-text-muted)]">
                    {t('rpt.ledger')}: <Ltr>{groupDigits(ledger)}</Ltr>
                  </span>
                ) : null}
              </th>
              <td className={tdNum}>
                <Amount value={total} />
              </td>
            </tr>
          </tfoot>
        </Table>
      )}
    </Card>
  );
  return (
    <>
      <PageHeader
        title={t('rpt.taxSummary')}
        back={{ href: `${base}/reports`, label: t('rpt.center') }}
        actions={
          <ReportActions
            locale={locale}
            printLabel={t('rpt.print')}
            action={res.ok ? requestExportAction.bind(null, locale, companyId) : undefined}
            initial={{ kind: 'tax_summary', from, to, branchId: branch }}
          />
        }
      >
        {res.ok ? (
          <span>
            <Ltr>{`${from} – ${to}`}</Ltr> · {cur} · {t('dash.freshness')}{' '}
            <time dateTime={res.data.asOf}>{formatDateTime(locale, res.data.asOf, company.timezone)}</time>
          </span>
        ) : null}
      </PageHeader>
      <LedgerFilters
        locale={locale}
        action={`${base}/reports/tax`}
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
          <Card className="mb-5">
            <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-3" data-net-tax={res.data.netTax}>
              <div>
                <dt className="text-[var(--color-text-muted)]">{t('rpt.outputTax')}</dt>
                <dd className="text-xl font-semibold">
                  <Ltr>{`${groupDigits(res.data.outputTax)} ${cur}`}</Ltr>
                </dd>
              </div>
              <div>
                <dt className="text-[var(--color-text-muted)]">{t('rpt.inputTax')}</dt>
                <dd className="text-xl font-semibold">
                  <Ltr>{`${groupDigits(res.data.inputTax)} ${cur}`}</Ltr>
                </dd>
              </div>
              <div>
                <dt className="text-[var(--color-text-muted)]">
                  {res.data.netTax.startsWith('-') ? t('rpt.netRefundable') : t('rpt.netPayable')}
                </dt>
                <dd className="text-xl font-semibold text-[var(--color-primary)]">
                  <Ltr>{`${groupDigits(res.data.netTax.replace('-', ''))} ${cur}`}</Ltr>
                </dd>
              </div>
            </dl>
          </Card>
          <Grid cols={2}>
            {side(
              t('rpt.outputSide'),
              'output',
              res.data.output,
              res.data.outputTax,
              res.data.outputLedger,
              res.data.outputReconciled,
            )}
            {side(
              t('rpt.inputSide'),
              'input',
              res.data.input,
              res.data.inputTax,
              res.data.inputLedger,
              res.data.inputReconciled,
            )}
          </Grid>
          <p className="text-xs text-[var(--color-text-muted)]">{t('rpt.taxNote')}</p>
        </>
      )}
    </>
  );
}
