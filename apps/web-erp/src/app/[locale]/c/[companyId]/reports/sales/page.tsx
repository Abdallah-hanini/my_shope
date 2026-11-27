import { unwrap } from '@erp/api-client';
import { createTranslator, formatDateTime, groupDigits, isLocale } from '@erp/localization';
import { Banknote, Percent, ReceiptText, Wrench } from 'lucide-react';
import { notFound } from 'next/navigation';
import { TrendChart } from '@/components/dashboard/charts';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { PrintButton } from '@/components/PrintButton';
import { ProblemNotice } from '@/components/ProblemNotice';
import { Amount, LedgerFilters } from '@/components/reports/LedgerParts';
import { branchOptions } from '@/components/reports/Statements';
import { Badge, Card, EmptyState, Grid, Ltr, PageHeader, Table, td, tdNum, th, thNum } from '@/components/ui';
import { attempt } from '@/lib/api';
import { loadCompany } from '@/lib/context';
import { ledgerRange } from '@/lib/ledger';

const UUID = /^[0-9a-f-]{36}$/i;

/** Sales (RPT-SAL-01): invoices less credit notes, labour vs parts, branches, months, top items. */
export default async function SalesReportPage({
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
        await api.GET('/api/v1/companies/{companyId}/reports/sales', {
          params: { path: { companyId }, query: { from, to, ...(branch ? { branchId: branch } : {}) } },
        }),
      ),
    ),
    branchOptions(api, can, companyId, locale),
  ]);
  const cur = company.baseCurrency;
  return (
    <>
      <PageHeader
        title={t('rpt.sales')}
        back={{ href: `${base}/reports`, label: t('rpt.center') }}
        actions={<PrintButton label={t('rpt.print')} />}
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
        action={`${base}/reports/sales`}
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
            aria-label={t('rpt.sales')}
            className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
          >
            <KpiCard
              label={t('rpt.salesExTax')}
              value={groupDigits(res.data.sales)}
              currency={cur}
              icon={Banknote}
              sub={`${t('rpt.invoicesN').replace('{n}', String(res.data.invoices))} · ${t('rpt.creditNotesN').replace('{n}', String(res.data.creditNotes))}`}
            />
            <KpiCard
              label={t('rpt.labourRevenue')}
              value={groupDigits(res.data.labourRevenue)}
              currency={cur}
              icon={Wrench}
            />
            <KpiCard
              label={t('rpt.partsRevenue')}
              value={groupDigits(res.data.partsRevenue)}
              currency={cur}
              icon={Percent}
              sub={res.data.partsSharePct ? `${res.data.partsSharePct}% ${t('rpt.ofSales')}` : undefined}
            />
            <KpiCard
              label={t('rpt.averageInvoice')}
              value={res.data.averageInvoice ? groupDigits(res.data.averageInvoice) : '—'}
              currency={res.data.averageInvoice ? cur : undefined}
              icon={ReceiptText}
              sub={`${t('rpt.discounts')}: ${groupDigits(res.data.discounts)} · ${t('rpt.tax')}: ${groupDigits(res.data.tax)}`}
            />
          </section>
          <p
            className="mb-5 flex flex-wrap items-center gap-2 text-sm"
            data-other-revenue={res.data.otherRevenue}
          >
            {res.data.otherRevenue === '0.00' ? (
              <Badge tone="success">✓ {t('rpt.salesMatchLedger')}</Badge>
            ) : (
              <Badge tone="info">
                {t('rpt.otherRevenue')}: <Ltr>{groupDigits(res.data.otherRevenue)}</Ltr>
              </Badge>
            )}
            <span className="text-[var(--color-text-muted)]">
              {t('rpt.ledgerRevenue')}: <Ltr>{`${groupDigits(res.data.ledgerRevenue)} ${cur}`}</Ltr>
            </span>
          </p>
          {res.data.byMonth.length > 1 ? (
            <Card title={t('rpt.salesByMonth')} id="by-month">
              <TrendChart
                label={t('rpt.salesByMonth')}
                rtl={locale === 'ar'}
                height={240}
                categories={res.data.byMonth.map((m) => m.month)}
                series={[
                  {
                    name: t('rpt.salesExTax'),
                    values: res.data.byMonth.map((m) => Number(m.sales)),
                    color: 'primary',
                    type: 'bar',
                  },
                ]}
              />
            </Card>
          ) : null}
          <Grid cols={2}>
            <Card title={t('rpt.topParts')} id="top-parts" flush>
              <ItemTable
                caption={t('rpt.topParts')}
                qtyLabel={t('inv.quantity')}
                items={res.data.topParts}
                empty={t('rpt.nothing')}
                t={t}
              />
            </Card>
            <Card title={t('rpt.topServices')} id="top-services" flush>
              <ItemTable
                caption={t('rpt.topServices')}
                qtyLabel={t('rpt.hours')}
                items={res.data.topServices}
                empty={t('rpt.nothing')}
                t={t}
              />
            </Card>
          </Grid>
          <Card title={t('rpt.byBranch')} id="by-branch" flush>
            <Table caption={t('rpt.byBranch')}>
              <thead>
                <tr>
                  <th scope="col" className={th}>
                    {t('common.branch')}
                  </th>
                  <th scope="col" className={thNum}>
                    {t('rpt.invoices')}
                  </th>
                  <th scope="col" className={thNum}>
                    {t('rpt.salesExTax')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {res.data.byBranch.map((b) => (
                  <tr key={b.branchCode}>
                    <td className={td}>{b.branchCode}</td>
                    <td className={tdNum}>{b.invoices}</td>
                    <td className={tdNum}>
                      <Amount value={b.sales} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
          <p className="text-xs text-[var(--color-text-muted)]">{t('rpt.salesNote')}</p>
        </>
      )}
    </>
  );
}

function ItemTable({
  caption,
  qtyLabel,
  items,
  empty,
  t,
}: {
  caption: string;
  qtyLabel: string;
  items: { description: string; quantity: string; amount: string }[];
  empty: string;
  t: ReturnType<typeof createTranslator>;
}) {
  if (!items.length) return <EmptyState>{empty}</EmptyState>;
  return (
    <Table caption={caption}>
      <thead>
        <tr>
          <th scope="col" className={th}>
            {t('rpt.item')}
          </th>
          <th scope="col" className={thNum}>
            {qtyLabel}
          </th>
          <th scope="col" className={thNum}>
            {t('rpt.amount')}
          </th>
        </tr>
      </thead>
      <tbody>
        {items.map((i) => (
          <tr key={i.description}>
            <td className={td}>{i.description}</td>
            <td className={tdNum}>
              <Ltr>{i.quantity}</Ltr>
            </td>
            <td className={tdNum}>
              <Amount value={i.amount} />
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
