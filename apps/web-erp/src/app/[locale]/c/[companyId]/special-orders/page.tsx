import { unwrap } from '@erp/api-client';
import { createTranslator, formatDateTime, isLocale, type MessageKey } from '@erp/localization';
import { PackageSearch } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProblemNotice } from '@/components/ProblemNotice';
import { Badge, Card, EmptyState, Ltr, PageHeader, Table, td, tdNum, th, thNum, Tabs } from '@/components/ui';
import { attempt } from '@/lib/api';
import { loadCompany } from '@/lib/context';

/** Parts ordered for jobs, oldest first: what is still awaited from suppliers (T-77). */
export default async function SpecialOrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; companyId: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { locale, companyId } = await params;
  if (!isLocale(locale)) notFound();
  const status = (await searchParams).status === 'all' ? 'all' : 'open';
  const t = createTranslator(locale);
  const ctx = await loadCompany(companyId);
  if (!ctx.ok) return null;
  const { api, company } = ctx.data;
  const res = await attempt(async () =>
    unwrap(
      await api.GET('/api/v1/companies/{companyId}/special-orders', {
        params: { path: { companyId }, query: { status } },
      }),
    ),
  );
  if (!res.ok) return <ProblemNotice result={res} locale={locale} />;
  const base = `/${locale}/c/${companyId}`;
  return (
    <>
      <PageHeader title={t('so.title')}>{t('so.listHelp')}</PageHeader>
      <Tabs
        label={t('so.title')}
        items={[
          { href: `${base}/special-orders`, label: t('so.waiting'), current: status === 'open' },
          { href: `${base}/special-orders?status=all`, label: t('so.all'), current: status === 'all' },
        ]}
      />
      {res.data.orders.length === 0 ? (
        <EmptyState icon={<PackageSearch aria-hidden size={18} />}>{t('so.none')}</EmptyState>
      ) : (
        <Card title={t('so.title')} flush>
          <Table caption={t('so.title')}>
            <thead>
              <tr>
                <th scope="col" className={th}>
                  {t('inv.sku')}
                </th>
                <th scope="col" className={thNum}>
                  {t('inv.quantity')}
                </th>
                <th scope="col" className={th}>
                  {t('so.job')}
                </th>
                <th scope="col" className={th}>
                  {t('pur.supplier')}
                </th>
                <th scope="col" className={th}>
                  {t('so.ordered')}
                </th>
                <th scope="col" className={thNum}>
                  {t('so.days')}
                </th>
                <th scope="col" className={th}>
                  {t('common.status')}
                </th>
              </tr>
            </thead>
            <tbody>
              {res.data.orders.map((o) => (
                <tr key={o.id} data-special-order={o.sku} data-status={o.status}>
                  <td className={td}>
                    <Ltr>{o.sku}</Ltr> {o.partName}
                  </td>
                  <td className={tdNum}>
                    <Ltr>{`${o.quantity} ${t(`inv.unit.${o.unit}` as MessageKey)}`}</Ltr>
                  </td>
                  <td className={td}>
                    <Link
                      href={`${base}/jobs/${o.jobId}`}
                      className="font-medium text-[var(--color-primary)] hover:underline"
                    >
                      <Ltr>{o.jobNumber}</Ltr>
                    </Link>
                    <span className="block text-xs text-[var(--color-text-muted)]">
                      <Ltr>{o.plate}</Ltr> · {o.customerName} · {o.branchCode}
                    </span>
                  </td>
                  <td className={td}>
                    {o.supplierName ?? '—'}
                    {o.orderRef ? (
                      <span className="block text-xs text-[var(--color-text-muted)]">
                        <Ltr>{o.orderRef}</Ltr>
                      </span>
                    ) : null}
                  </td>
                  <td className={td}>{formatDateTime(locale, o.orderedAt, company.timezone)}</td>
                  <td className={tdNum}>
                    <Ltr>{String(o.daysWaiting)}</Ltr>
                  </td>
                  <td className={td}>
                    <Badge
                      tone={
                        o.status === 'ordered' ? 'warning' : o.status === 'cancelled' ? 'neutral' : 'success'
                      }
                    >
                      {t(`jp.status.${o.status}` as MessageKey)}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </>
  );
}
