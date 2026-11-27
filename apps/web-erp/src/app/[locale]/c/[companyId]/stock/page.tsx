import { unwrap } from '@erp/api-client';
import { createTranslator, formatDateTime, isLocale, type MessageKey } from '@erp/localization';
import { Boxes } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProblemNotice } from '@/components/ProblemNotice';
import { Badge, Card, EmptyState, Ltr, PageHeader, Table, td, tdNum, th, thNum } from '@/components/ui';
import { attempt } from '@/lib/api';
import { loadCompany } from '@/lib/context';

/** Stock value by part, reconciled to the inventory account (T-74). */
export default async function StockPage({
  params,
}: {
  params: Promise<{ locale: string; companyId: string }>;
}) {
  const { locale, companyId } = await params;
  if (!isLocale(locale)) notFound();
  const t = createTranslator(locale);
  const ctx = await loadCompany(companyId);
  if (!ctx.ok) return null;
  const { api, company } = ctx.data;
  const res = await attempt(async () =>
    unwrap(
      await api.GET('/api/v1/companies/{companyId}/inventory/valuation', { params: { path: { companyId } } }),
    ),
  );
  if (!res.ok) return <ProblemNotice result={res} locale={locale} />;
  const v = res.data;
  const base = `/${locale}/c/${companyId}`;
  return (
    <>
      <PageHeader title={t('inv.stockValue')}>
        {t('labour.asOf')} <time dateTime={v.asOf}>{formatDateTime(locale, v.asOf, company.timezone)}</time>
      </PageHeader>
      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm" data-reconciliation>
        <span>
          {t('inv.totalValue')}:{' '}
          <strong>
            <Ltr>{`${v.totalValue} ${v.currency}`}</Ltr>
          </strong>
        </span>
        <span>
          {t('inv.ledgerBalance')}: <Ltr>{v.ledgerBalance ? `${v.ledgerBalance} ${v.currency}` : '—'}</Ltr>
        </span>
        {v.ledgerBalance === null ? (
          <Badge>{t('inv.noInventoryAccount')}</Badge>
        ) : v.reconciled ? (
          <Badge tone="success">{t('inv.reconciled')}</Badge>
        ) : (
          <Badge tone="danger">{t('inv.notReconciled')}</Badge>
        )}
      </div>
      {v.rows.length === 0 ? (
        <EmptyState icon={<Boxes aria-hidden size={18} />}>{t('inv.noStock')}</EmptyState>
      ) : (
        <Card title={t('inv.stockValue')} flush>
          <Table caption={t('inv.stockValue')}>
            <thead>
              <tr>
                <th scope="col" className={th}>
                  {t('inv.sku')}
                </th>
                <th scope="col" className={th}>
                  {t('bay.name')}
                </th>
                <th scope="col" className={thNum}>
                  {t('inv.onHand')}
                </th>
                <th scope="col" className={thNum}>
                  {t('inv.avgCost')}
                </th>
                <th scope="col" className={thNum}>
                  {t('inv.value')}
                </th>
              </tr>
            </thead>
            <tbody>
              {v.rows.map((r) => (
                <tr key={r.partId}>
                  <td className={td}>
                    <Link
                      href={`${base}/parts/${r.partId}`}
                      className="text-[var(--color-primary)] hover:underline"
                    >
                      <Ltr>{r.sku}</Ltr>
                    </Link>
                  </td>
                  <td className={td}>{r.name}</td>
                  <td className={tdNum}>
                    <Ltr>{`${r.onHand} ${t(`inv.unit.${r.unit}` as MessageKey)}`}</Ltr>
                  </td>
                  <td className={tdNum}>
                    <Ltr>{r.averageCost ?? '—'}</Ltr>
                  </td>
                  <td className={tdNum}>
                    <Ltr>{r.value}</Ltr>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" colSpan={4} className={`${td} text-start font-semibold`}>
                  {t('labour.total')}
                </th>
                <td className={`${tdNum} font-semibold`}>
                  <Ltr>{v.totalValue}</Ltr>
                </td>
              </tr>
            </tfoot>
          </Table>
        </Card>
      )}
    </>
  );
}
