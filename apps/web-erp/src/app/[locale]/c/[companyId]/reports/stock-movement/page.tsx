import { unwrap } from '@erp/api-client';
import { createTranslator, formatDateTime, groupDigits, isLocale, type MessageKey } from '@erp/localization';
import { Archive, Boxes, RefreshCw, TrendingDown } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { PrintButton } from '@/components/PrintButton';
import { ProblemNotice } from '@/components/ProblemNotice';
import { Amount, LedgerFilters } from '@/components/reports/LedgerParts';
import { branchOptions, Reconciliation } from '@/components/reports/Statements';
import { Badge, Card, EmptyState, Ltr, PageHeader, Table, td, tdNum, th, thNum } from '@/components/ui';
import { attempt } from '@/lib/api';
import { loadCompany } from '@/lib/context';
import { ledgerRange } from '@/lib/ledger';

const UUID = /^[0-9a-f-]{36}$/i;
const TONE = { fast: 'success', slow: 'warning', dead: 'danger', none: 'neutral' } as const;

/** Stock movement (RPT-INV-02): flow per part, turnover, fast / slow / dead, reconciled. */
export default async function StockMovementPage({
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
        await api.GET('/api/v1/companies/{companyId}/reports/stock-movement', {
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
        title={t('rpt.stockMovement')}
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
        action={`${base}/reports/stock-movement`}
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
            aria-label={t('rpt.stockMovement')}
            className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
          >
            <KpiCard
              label={t('rpt.closingStock')}
              value={groupDigits(res.data.closingValue)}
              currency={cur}
              icon={Boxes}
              sub={`${t('rpt.openingStock')}: ${groupDigits(res.data.openingValue)}`}
            />
            <KpiCard
              label={t('rpt.issuedCost')}
              value={groupDigits(res.data.issuedValue)}
              currency={cur}
              icon={TrendingDown}
            />
            <KpiCard
              label={t('rpt.turnover')}
              value={res.data.turnover ?? '—'}
              icon={RefreshCw}
              sub={t('rpt.turnoverHelp')}
            />
            <KpiCard
              label={t('rpt.deadStock')}
              value={String(res.data.counts.dead)}
              icon={Archive}
              sub={`${t('rpt.class.fast')}: ${res.data.counts.fast} · ${t('rpt.class.slow')}: ${res.data.counts.slow}`}
              tone={res.data.counts.dead ? 'negative' : 'neutral'}
            />
          </section>
          <Reconciliation
            locale={locale}
            reconciled={res.data.reconciled}
            documents={res.data.closingValue}
            ledger={res.data.ledgerInventory ?? null}
            currency={cur}
          />
          <Card title={t('rpt.byPart')} id="by-part" flush>
            {res.data.parts.length === 0 ? (
              <EmptyState>{t('inv.noStock')}</EmptyState>
            ) : (
              <Table caption={t('rpt.byPart')}>
                <thead>
                  <tr>
                    <th scope="col" className={th}>
                      {t('inv.sku')}
                    </th>
                    <th scope="col" className={thNum}>
                      {t('rpt.opening')}
                    </th>
                    <th scope="col" className={thNum}>
                      {t('rpt.received')}
                    </th>
                    <th scope="col" className={thNum}>
                      {t('rpt.issued')}
                    </th>
                    <th scope="col" className={thNum}>
                      {t('rpt.closing')}
                    </th>
                    <th scope="col" className={thNum}>
                      {t('rpt.issuedCost')}
                    </th>
                    <th scope="col" className={thNum}>
                      {t('rpt.closingValue')}
                    </th>
                    <th scope="col" className={thNum}>
                      {t('rpt.turnover')}
                    </th>
                    <th scope="col" className={th}>
                      {t('rpt.lastIssue')}
                    </th>
                    <th scope="col" className={th}>
                      {t('rpt.classCol')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {res.data.parts.map((p) => (
                    <tr key={p.partId} data-stock-part={p.sku} data-class={p.class}>
                      <td className={td}>
                        <Link
                          href={`${base}/parts/${p.partId}`}
                          className="text-[var(--color-primary)] hover:underline"
                        >
                          <Ltr>{p.sku}</Ltr>
                        </Link>{' '}
                        {p.name}
                      </td>
                      <td className={tdNum}>
                        <Ltr>{p.openingQty}</Ltr>
                      </td>
                      <td className={tdNum}>
                        <Ltr>{p.receivedQty}</Ltr>
                      </td>
                      <td className={tdNum}>
                        <Ltr>{p.issuedQty}</Ltr>
                      </td>
                      <td className={tdNum}>
                        <Ltr>{p.closingQty}</Ltr>
                      </td>
                      <td className={tdNum}>
                        <Amount value={p.issuedValue} />
                      </td>
                      <td className={tdNum}>
                        <Amount value={p.closingValue} />
                      </td>
                      <td className={tdNum}>
                        <Ltr>{p.turnover ?? '—'}</Ltr>
                      </td>
                      <td className={td}>
                        <Ltr>{p.lastIssueDate ?? '—'}</Ltr>
                      </td>
                      <td className={td}>
                        <Badge tone={TONE[p.class as keyof typeof TONE] ?? 'neutral'}>
                          {t(`rpt.class.${p.class}` as MessageKey)}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
          <p className="text-xs text-[var(--color-text-muted)]">{t('rpt.stockNote')}</p>
        </>
      )}
    </>
  );
}
