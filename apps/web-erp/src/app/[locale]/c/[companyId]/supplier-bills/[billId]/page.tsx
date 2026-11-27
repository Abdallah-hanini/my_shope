import { unwrap } from '@erp/api-client';
import { createTranslator, formatDateTime, isLocale, type MessageKey } from '@erp/localization';
import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProblemNotice } from '@/components/ProblemNotice';
import { BillStatus } from '@/components/purchasing/BillStatus';
import {
  buttonSecondary,
  Card,
  inputClass,
  Ltr,
  Notice,
  PageHeader,
  Table,
  td,
  tdNum,
  th,
  thNum,
  fieldLabel,
} from '@/components/ui';
import { InlineForm } from '@/components/workshop/InlineForm';
import { attempt } from '@/lib/api';
import { loadCompany } from '@/lib/context';
import { supplierBillAction, type BillOp } from '../../purchasing-actions';

const UUID = /^[0-9a-f-]{36}$/i;

/** A supplier bill: receipts charged, totals and journal, payments, cancel (T-76). */
export default async function SupplierBillPage({
  params,
}: {
  params: Promise<{ locale: string; companyId: string; billId: string }>;
}) {
  const { locale, companyId, billId } = await params;
  if (!isLocale(locale) || !UUID.test(billId)) notFound();
  const t = createTranslator(locale);
  const ctx = await loadCompany(companyId);
  if (!ctx.ok) return null;
  const { api, company } = ctx.data;
  const res = await attempt(async () =>
    unwrap(
      await api.GET('/api/v1/companies/{companyId}/supplier-bills/{billId}', {
        params: { path: { companyId, billId } },
      }),
    ),
  );
  if (!res.ok) return res.status === 404 ? notFound() : <ProblemNotice result={res} locale={locale} />;
  const b = res.data;
  const base = `/${locale}/c/${companyId}`;
  const act = (op: BillOp) => supplierBillAction.bind(null, locale, companyId, b.id, op);
  const row = (label: string, value: string, strong = false) => (
    <div className="flex justify-between gap-4 py-1">
      <dt>{label}</dt>
      <dd className={strong ? 'font-semibold' : undefined}>
        <Ltr>{value}</Ltr>
      </dd>
    </div>
  );
  return (
    <>
      <PageHeader title={`${b.number} · ${b.supplierName}`}>
        <span className="inline-flex flex-wrap items-center gap-2">
          <BillStatus locale={locale} status={b.status} overdue={b.overdue} />
          <span>
            {t('pur.invoiceNo')} <Ltr>{b.supplierInvoiceNo}</Ltr> · {t('pur.invoiceDate')}{' '}
            <Ltr>{b.billDate}</Ltr> · {t('pur.dueDate')} <Ltr>{b.dueDate}</Ltr> · {t('job.branch')}{' '}
            {b.branchCode}
          </span>
          <Link
            href={`${base}/suppliers/${b.supplierId}`}
            className="text-[var(--color-primary)] hover:underline"
          >
            {t('pur.supplier')}
          </Link>
        </span>
      </PageHeader>

      <Card title={t('pur.receipts')} id="lines" flush>
        <Table caption={t('pur.receipts')}>
          <thead>
            <tr>
              <th scope="col" className={th}>
                {t('inv.number')}
              </th>
              <th scope="col" className={th}>
                {t('inv.sku')}
              </th>
              <th scope="col" className={thNum}>
                {t('inv.quantity')}
              </th>
              <th scope="col" className={thNum}>
                {t('pur.receiptValue')}
              </th>
              <th scope="col" className={thNum}>
                {t('pur.billed')}
              </th>
            </tr>
          </thead>
          <tbody>
            {b.lines.map((l) => (
              <tr key={l.lineNo} data-bill-line={l.movementNumber}>
                <td className={td}>
                  <Ltr>{l.movementNumber}</Ltr>
                  {l.reference ? (
                    <div className="text-xs text-[var(--color-text-muted)]">{l.reference}</div>
                  ) : null}
                </td>
                <td className={td}>
                  <Ltr>{l.sku}</Ltr> · {l.partName}
                </td>
                <td className={tdNum}>
                  <Ltr>{l.quantity}</Ltr>
                </td>
                <td className={tdNum}>
                  <Ltr>{l.receiptValue}</Ltr>
                </td>
                <td className={tdNum}>
                  <Ltr>{l.amount}</Ltr>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card title={t('pur.totals')} id="totals">
        <dl className="max-w-md text-sm" data-bill-total={b.total}>
          {row(t('pur.receiptValue'), b.receiptsValue)}
          {row(t('pur.billed'), b.netAmount)}
          {b.varianceAmount !== '0.00' ? row(t('pur.variance'), b.varianceAmount) : null}
          {row(
            b.taxCode
              ? `${t('pur.tax')} ${b.taxCode} ${b.taxPct ? `(${Number(b.taxPct)}%)` : ''}`
              : t('pur.tax'),
            b.taxAmount,
          )}
          {row(t('pur.total'), `${b.total} ${b.currency}`, true)}
          {row(t('pur.paid'), b.paid)}
          {row(t('pur.balance'), b.balance, true)}
        </dl>
        {b.varianceReason ? (
          <p className="mt-2 text-sm">
            {t('pur.varianceReason')}: {b.varianceReason}
          </p>
        ) : null}
        <p className="mt-2 text-xs text-[var(--color-text-muted)]">
          {t('pur.journal')} <Ltr>{b.journalNumber}</Ltr> · {b.createdByName} ·{' '}
          {formatDateTime(locale, b.createdAt, company.timezone)}
        </p>
        {b.status === 'cancelled' ? (
          <div className="mt-3">
            <Notice tone="warning">
              {t('pur.cancelledBy')} {b.cancelledByName}: {b.cancelReason} ·{' '}
              <Ltr>{b.cancelJournalNumber ?? ''}</Ltr>
            </Notice>
          </div>
        ) : null}
      </Card>

      <Card title={t('pur.payments')} id="payments">
        {b.payments.length === 0 ? (
          <p className="mb-3 text-sm">{t('pur.noPayments')}</p>
        ) : (
          <ul className="mb-3 flex flex-col gap-1 text-sm">
            {b.payments.map((x) => (
              <li key={x.id} data-supplier-payment={x.number}>
                <Ltr>{x.number}</Ltr> · {t(`bill.method.${x.method}` as MessageKey)} · <Ltr>{x.amount}</Ltr>
                {x.reference ? (
                  <>
                    {' '}
                    · <Ltr>{x.reference}</Ltr>
                  </>
                ) : null}{' '}
                · {x.paidByName} · {formatDateTime(locale, x.paidAt, company.timezone)} ·{' '}
                <Ltr>{x.journalNumber}</Ltr>
              </li>
            ))}
          </ul>
        )}
        {b.payBlockedReason ? (
          <p className="mb-3 text-sm text-[var(--color-text-muted)]">{t('pur.payBlocked')}</p>
        ) : null}
        {b.actions.includes('pay') ? (
          <InlineForm action={act('pay')} locale={locale} submitLabel={t('pur.pay')} ariaLabel={t('pur.pay')}>
            <input type="hidden" name="idempotencyKey" value={randomUUID()} />
            <label className={fieldLabel}>
              {t('bill.method')}
              <select name="method" defaultValue="bank" className={`${inputClass} w-40`}>
                <option value="bank">{t('bill.method.bank')}</option>
                <option value="cash">{t('bill.method.cash')}</option>
              </select>
            </label>
            <label className={fieldLabel}>
              {`${t('quote.amount')} (${b.currency})`}
              <input
                name="amount"
                defaultValue={b.balance}
                inputMode="decimal"
                dir="ltr"
                className={`${inputClass} w-32`}
              />
            </label>
            <label className={fieldLabel}>
              {t('pur.transferRef')}
              <input name="reference" maxLength={80} dir="ltr" className={`${inputClass} w-44`} />
            </label>
          </InlineForm>
        ) : null}
      </Card>

      {b.actions.includes('cancel') ? (
        <Card title={t('pur.cancel')} id="cancel">
          <p className="mb-3 text-sm text-[var(--color-text-muted)]">{t('pur.cancelHelp')}</p>
          <InlineForm
            action={act('cancel')}
            locale={locale}
            submitLabel={t('pur.cancel')}
            submitClassName={buttonSecondary}
            ariaLabel={t('pur.cancel')}
          >
            <label className={fieldLabel}>
              {t('inv.reason')}
              <input name="reason" maxLength={500} className={`${inputClass} w-72`} />
            </label>
          </InlineForm>
        </Card>
      ) : null}
    </>
  );
}
