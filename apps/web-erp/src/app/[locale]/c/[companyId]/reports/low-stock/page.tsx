import { unwrap } from '@erp/api-client';
import { createTranslator, formatDateTime, groupDigits, isLocale, type MessageKey } from '@erp/localization';
import { PackageX, ShoppingCart, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { PrintButton } from '@/components/PrintButton';
import { ProblemNotice } from '@/components/ProblemNotice';
import { Amount } from '@/components/reports/LedgerParts';
import { BranchYearFilters, branchOptions } from '@/components/reports/Statements';
import { Badge, Card, EmptyState, Ltr, PageHeader, Table, td, tdNum, th, thNum } from '@/components/ui';
import { attempt } from '@/lib/api';
import { loadCompany, localName } from '@/lib/context';

const UUID = /^[0-9a-f-]{36}$/i;

/** Low stock (RPT-INV-03, R3a): parts at or below their reorder point with a suggested order. */
export default async function LowStockPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; companyId: string }>;
  searchParams: Promise<{ branch?: string }>;
}) {
  const { locale, companyId } = await params;
  if (!isLocale(locale)) notFound();
  const sp = await searchParams;
  const t = createTranslator(locale);
  const ctx = await loadCompany(companyId);
  if (!ctx.ok) return null;
  const { api, can, company } = ctx.data;
  const branch = sp.branch && UUID.test(sp.branch) ? sp.branch : undefined;
  const base = `/${locale}/c/${companyId}`;
  const [res, branches] = await Promise.all([
    attempt(async () =>
      unwrap(
        await api.GET('/api/v1/companies/{companyId}/reports/low-stock', {
          params: { path: { companyId }, query: branch ? { branchId: branch } : {} },
        }),
      ),
    ),
    branchOptions(api, can, companyId, locale),
  ]);
  const cur = company.baseCurrency;
  return (
    <>
      <PageHeader
        title={t('plan.lowStock')}
        back={{ href: `${base}/reports`, label: t('rpt.center') }}
        actions={<PrintButton label={t('rpt.print')} />}
      >
        {res.ok ? (
          <span>
            {t('plan.computedAt')}{' '}
            <time dateTime={res.data.asOf}>{formatDateTime(locale, res.data.asOf, company.timezone)}</time>
          </span>
        ) : null}
      </PageHeader>
      <BranchYearFilters
        locale={locale}
        action={`${base}/reports/low-stock`}
        branch={branch}
        branches={branches}
        allLabel={t('dash.allBranches')}
      />
      {!res.ok ? (
        <ProblemNotice result={res} locale={locale} />
      ) : (
        <>
          <section aria-label={t('plan.lowStock')} className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <KpiCard
              label={t('plan.outOfStock')}
              value={String(res.data.outCount)}
              icon={PackageX}
              tone={res.data.outCount ? 'negative' : 'neutral'}
            />
            <KpiCard
              label={t('plan.belowPoint')}
              value={String(res.data.lowCount)}
              icon={TriangleAlert}
              sub={t('plan.levelsSet').replace('{n}', String(res.data.levelsSet))}
            />
            <KpiCard
              label={t('plan.suggestedValue')}
              value={groupDigits(res.data.suggestedValue)}
              currency={cur}
              icon={ShoppingCart}
              sub={t('plan.atAverageCost')}
            />
          </section>
          <Card title={t('plan.toReorder')} id="to-reorder" flush>
            {res.data.levelsSet === 0 ? (
              <EmptyState title={t('plan.noPointsTitle')}>{t('plan.noPoints')}</EmptyState>
            ) : res.data.lines.length === 0 ? (
              <EmptyState>{t('plan.allAbove')}</EmptyState>
            ) : (
              <Table caption={t('plan.toReorder')}>
                <thead>
                  <tr>
                    <th scope="col" className={th}>
                      {t('inv.sku')}
                    </th>
                    <th scope="col" className={th}>
                      {t('common.branch')}
                    </th>
                    <th scope="col" className={thNum}>
                      {t('inv.onHand')}
                    </th>
                    <th scope="col" className={thNum}>
                      {t('jp.reserved')}
                    </th>
                    <th scope="col" className={thNum}>
                      {t('plan.available')}
                    </th>
                    <th scope="col" className={thNum}>
                      {t('plan.reorderPoint')}
                    </th>
                    <th scope="col" className={thNum}>
                      {t('plan.suggested')}
                    </th>
                    <th scope="col" className={thNum}>
                      {t('plan.suggestedValueCol')}
                    </th>
                    <th scope="col" className={th}>
                      {t('plan.status')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {res.data.lines.map((l) => (
                    <tr key={`${l.partId}-${l.branchId}`} data-low-stock={l.sku} data-status={l.status}>
                      <td className={td}>
                        <Link
                          href={`${base}/parts/${l.partId}`}
                          className="text-[var(--color-primary)] hover:underline"
                        >
                          <Ltr>{l.sku}</Ltr>
                        </Link>{' '}
                        {localName(l, locale)}
                      </td>
                      <td className={td}>{l.branchCode}</td>
                      <td className={tdNum}>
                        <Ltr>{l.onHand}</Ltr>
                      </td>
                      <td className={tdNum}>
                        <Ltr>{l.reserved}</Ltr>
                      </td>
                      <td className={tdNum}>
                        <Ltr>{l.available}</Ltr>
                      </td>
                      <td className={tdNum}>
                        <Ltr>{l.minQuantity}</Ltr>
                      </td>
                      <td className={tdNum}>
                        <strong>
                          <Ltr>{`${l.suggested} ${t(`inv.unit.${l.unit}` as MessageKey)}`}</Ltr>
                        </strong>
                      </td>
                      <td className={tdNum}>
                        {l.suggestedValue ? <Amount value={l.suggestedValue} /> : '—'}
                      </td>
                      <td className={td}>
                        <Badge tone={l.status === 'out' ? 'danger' : 'warning'}>
                          {t(l.status === 'out' ? 'plan.out' : 'plan.low')}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
          <p className="text-xs text-[var(--color-text-muted)]">{t('plan.lowStockNote')}</p>
        </>
      )}
    </>
  );
}
