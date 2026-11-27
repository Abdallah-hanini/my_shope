import { unwrap } from '@erp/api-client';
import { createTranslator, formatDateTime, isLocale } from '@erp/localization';
import { ReceiptText } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProblemNotice } from '@/components/ProblemNotice';
import { BillStatus } from '@/components/purchasing/BillStatus';
import {
  Card,
  EmptyState,
  Ltr,
  Notice,
  PageHeader,
  Table,
  td,
  tdNum,
  th,
  thNum,
  Tabs,
} from '@/components/ui';
import { attempt } from '@/lib/api';
import { loadCompany } from '@/lib/context';

/** Supplier bills by due date, with payables and goods received reconciled to the ledger (T-76). */
export default async function SupplierBillsPage({
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
      await api.GET('/api/v1/companies/{companyId}/supplier-bills', {
        params: { path: { companyId }, query: { status } },
      }),
    ),
  );
  if (!res.ok) return <ProblemNotice result={res} locale={locale} />;
  const { bills, reconciliation: r, currency } = res.data;
  const base = `/${locale}/c/${companyId}`;
  return (
    <>
      <PageHeader title={t('pur.bills')}>{t('pur.billsHelp')}</PageHeader>
      <Card title={t('pur.reconciliation')} id="reconciliation" className="mb-6">
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2" data-reconciled={String(r.reconciled)}>
          <div>
            <dt className="text-[var(--color-text-muted)]">{t('pur.openBills')}</dt>
            <dd>
              <Ltr>{`${r.openBills} ${currency}`}</Ltr> · {t('pur.payablesLedger')}:{' '}
              <Ltr>{r.payablesLedger ?? '—'}</Ltr>
            </dd>
          </div>
          <div>
            <dt className="text-[var(--color-text-muted)]">{t('pur.unbilledReceipts')}</dt>
            <dd>
              <Ltr>{`${r.unbilledReceipts} ${currency}`}</Ltr> · {t('pur.grniLedger')}:{' '}
              <Ltr>{r.goodsReceivedLedger ?? '—'}</Ltr>
            </dd>
          </div>
        </dl>
        <div className="mt-3">
          {r.reconciled ? (
            <Notice tone="success">{t('inv.reconciled')}</Notice>
          ) : (
            <Notice tone="warning">{t('pur.notReconciled')}</Notice>
          )}
        </div>
        <p className="mt-2 text-xs text-[var(--color-text-muted)]">
          {t('pur.asOf')} {formatDateTime(locale, r.asOf, company.timezone)}
        </p>
      </Card>
      <Tabs
        label={t('pur.bills')}
        items={[
          { href: `${base}/supplier-bills`, label: t('pur.openOnly'), current: status === 'open' },
          { href: `${base}/supplier-bills?status=all`, label: t('pur.allBills'), current: status === 'all' },
        ]}
      />
      {bills.length === 0 ? (
        <EmptyState icon={<ReceiptText aria-hidden size={18} />}>{t('pur.noBills')}</EmptyState>
      ) : (
        <Card title={t('pur.bills')} flush>
          <Table caption={t('pur.bills')}>
            <thead>
              <tr>
                <th scope="col" className={th}>
                  {t('inv.number')}
                </th>
                <th scope="col" className={th}>
                  {t('pur.supplier')}
                </th>
                <th scope="col" className={th}>
                  {t('pur.invoiceNo')}
                </th>
                <th scope="col" className={th}>
                  {t('pur.dueDate')}
                </th>
                <th scope="col" className={th}>
                  {t('common.status')}
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
              {bills.map((b) => (
                <tr key={b.id} data-bill={b.number}>
                  <td className={td}>
                    <Link
                      href={`${base}/supplier-bills/${b.id}`}
                      className="font-medium text-[var(--color-primary)] hover:underline"
                    >
                      <Ltr>{b.number}</Ltr>
                    </Link>
                    <div className="text-xs text-[var(--color-text-muted)]">{b.branchCode}</div>
                  </td>
                  <td className={td}>
                    <Link href={`${base}/suppliers/${b.supplierId}`} className="hover:underline">
                      {b.supplierName}
                    </Link>
                  </td>
                  <td className={td}>
                    <Ltr>{b.supplierInvoiceNo}</Ltr>
                  </td>
                  <td className={td}>
                    <Ltr>{b.dueDate}</Ltr>
                  </td>
                  <td className={td}>
                    <BillStatus locale={locale} status={b.status} overdue={b.overdue} />
                  </td>
                  <td className={tdNum}>
                    <Ltr>{b.total}</Ltr>
                  </td>
                  <td className={tdNum}>
                    <Ltr>{b.balance}</Ltr>
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
