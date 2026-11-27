import { unwrap } from '@erp/api-client';
import { createTranslator, formatDateTime, isLocale } from '@erp/localization';
import { randomUUID } from 'node:crypto';
import { Truck } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProblemNotice } from '@/components/ProblemNotice';
import { BillStatus } from '@/components/purchasing/BillStatus';
import { SupplierFields } from '@/components/purchasing/SupplierFields';
import {
  Badge,
  buttonSecondary,
  Card,
  EmptyState,
  inputClass,
  Ltr,
  PageHeader,
  Table,
  td,
  tdNum,
  th,
  thNum,
  fieldLabel,
  SplitLayout,
  DescriptionList,
} from '@/components/ui';
import { InlineForm } from '@/components/workshop/InlineForm';
import { attempt } from '@/lib/api';
import { loadCompany } from '@/lib/context';
import { isoToZonedLocal } from '@/lib/time';
import { createSupplierBillAction, updateSupplierAction } from '../../purchasing-actions';

const UUID = /^[0-9a-f-]{36}$/i;

/** A supplier: profile, bills, and entering a bill for receipts not yet billed (T-76). */
export default async function SupplierPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; companyId: string; supplierId: string }>;
  searchParams: Promise<{ branch?: string }>;
}) {
  const { locale, companyId, supplierId } = await params;
  if (!isLocale(locale) || !UUID.test(supplierId)) notFound();
  const t = createTranslator(locale);
  const ctx = await loadCompany(companyId);
  if (!ctx.ok) return null;
  const { api, company } = ctx.data;
  const res = await attempt(async () =>
    unwrap(
      await api.GET('/api/v1/companies/{companyId}/suppliers/{supplierId}', {
        params: { path: { companyId, supplierId } },
      }),
    ),
  );
  if (!res.ok) return res.status === 404 ? notFound() : <ProblemNotice result={res} locale={locale} />;
  const s = res.data;
  const wanted = (await searchParams).branch;
  const branch = s.billBranches.find((b) => b.id === wanted) ?? s.billBranches[0] ?? null;
  const unbilled = branch
    ? await attempt(async () =>
        unwrap(
          await api.GET('/api/v1/companies/{companyId}/suppliers/{supplierId}/unbilled-receipts', {
            params: { path: { companyId, supplierId }, query: { branchId: branch.id } },
          }),
        ),
      )
    : null;
  const base = `/${locale}/c/${companyId}`;
  const today = isoToZonedLocal(new Date().toISOString(), company.timezone).slice(0, 10);
  const cur = company.baseCurrency;
  return (
    <>
      <PageHeader title={locale === 'ar' && s.nameAr ? s.nameAr : s.name}>
        <span className="inline-flex flex-wrap items-center gap-2">
          {s.active ? null : <Badge>{t('bay.inactive')}</Badge>}
          <span>{t('pur.termsDays').replace('{n}', String(s.paymentTermsDays))}</span>·
          <span data-supplier-balance>
            {t('pur.owed')} <Ltr>{`${s.balance} ${cur}`}</Ltr> · {t('pur.overdue')} <Ltr>{s.overdue}</Ltr>
          </span>
          {s.phone ? (
            <span>
              · <Ltr>{s.phone}</Ltr>
            </span>
          ) : null}
          {s.taxNumber ? (
            <span>
              · {t('pur.taxNumber')} <Ltr>{s.taxNumber}</Ltr>
            </span>
          ) : null}
        </span>
      </PageHeader>

      <SplitLayout
        main={
          <>
            {branch ? (
              <Card title={t('pur.enterBill')} id="enter-bill">
                {s.billBranches.length > 1 ? (
                  <nav className="mb-3 flex flex-wrap gap-2 text-sm" aria-label={t('job.branch')}>
                    {s.billBranches.map((b) => (
                      <Link
                        key={b.id}
                        href={`${base}/suppliers/${s.id}?branch=${b.id}#enter-bill`}
                        aria-current={b.id === branch.id ? 'page' : undefined}
                        className={
                          b.id === branch.id
                            ? 'font-semibold underline'
                            : 'text-[var(--color-primary)] hover:underline'
                        }
                      >
                        {b.code}
                      </Link>
                    ))}
                  </nav>
                ) : null}
                <p className="mb-3 text-sm text-[var(--color-text-muted)]">{t('pur.enterBillHelp')}</p>
                {!unbilled?.ok ? (
                  unbilled ? (
                    <ProblemNotice result={unbilled} locale={locale} />
                  ) : null
                ) : unbilled.data.receipts.length === 0 ? (
                  <EmptyState icon={<Truck aria-hidden size={18} />}>{t('pur.noUnbilled')}</EmptyState>
                ) : (
                  <InlineForm
                    action={createSupplierBillAction.bind(null, locale, companyId, s.id, branch.id)}
                    locale={locale}
                    submitLabel={t('pur.postBill')}
                    className="flex flex-col gap-4"
                    ariaLabel={t('pur.enterBill')}
                  >
                    <input type="hidden" name="idempotencyKey" value={randomUUID()} />
                    <div className="flex flex-wrap items-end gap-3">
                      <label className={fieldLabel}>
                        {t('pur.invoiceNo')}
                        <input
                          name="supplierInvoiceNo"
                          maxLength={60}
                          dir="ltr"
                          className={`${inputClass} w-40`}
                        />
                      </label>
                      <label className={fieldLabel}>
                        {t('pur.invoiceDate')}
                        <input
                          name="billDate"
                          type="date"
                          defaultValue={today}
                          max={today}
                          dir="ltr"
                          className={`${inputClass} w-40`}
                        />
                      </label>
                      <label className={fieldLabel}>
                        {t('pur.tax')}
                        <select
                          name="taxCodeId"
                          defaultValue={unbilled.data.defaultTaxCodeId ?? ''}
                          className={`${inputClass} w-44`}
                        >
                          <option value="">{t('pur.noTax')}</option>
                          {unbilled.data.taxCodes.map((c) => (
                            <option key={c.id} value={c.id}>{`${c.code} — ${c.name}`}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <Table caption={t('pur.receipts')}>
                      <thead>
                        <tr>
                          <th scope="col" className={th}>
                            {t('pur.include')}
                          </th>
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
                        {unbilled.data.receipts.map((r) => (
                          <tr key={r.movementId} data-unbilled={r.number}>
                            <td className={td}>
                              <input
                                type="checkbox"
                                name={`pick:${r.movementId}`}
                                defaultChecked={r.fromThisSupplier}
                                aria-label={`${t('pur.include')} ${r.number}`}
                                className="h-5 w-5"
                              />
                            </td>
                            <td className={td}>
                              <Ltr>{r.number}</Ltr>
                              <div className="text-xs text-[var(--color-text-muted)]">
                                {r.reference} · {formatDateTime(locale, r.receivedAt, company.timezone)}
                                {r.fromThisSupplier ? null : ` · ${t('pur.noSupplierRecorded')}`}
                              </div>
                            </td>
                            <td className={td}>
                              <Ltr>{r.sku}</Ltr> · {r.partName}
                            </td>
                            <td className={tdNum}>
                              <Ltr>{r.quantity}</Ltr>
                            </td>
                            <td className={tdNum}>
                              <Ltr>{r.value}</Ltr>
                            </td>
                            <td className={tdNum}>
                              <input
                                name={`amount:${r.movementId}`}
                                defaultValue={r.value}
                                inputMode="decimal"
                                dir="ltr"
                                aria-label={`${t('pur.billed')} ${r.number}`}
                                className={`${inputClass} w-28 text-end`}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                    <label className={fieldLabel}>
                      {t('pur.varianceReason')}
                      <input
                        name="varianceReason"
                        maxLength={300}
                        className={`${inputClass} w-full max-w-md`}
                      />
                    </label>
                  </InlineForm>
                )}
              </Card>
            ) : null}

            <Card title={t('pur.bills')} id="bills" flush>
              {s.bills.length === 0 ? (
                <p className="p-4 text-sm">{t('pur.noBills')}</p>
              ) : (
                <Table caption={t('pur.bills')}>
                  <thead>
                    <tr>
                      <th scope="col" className={th}>
                        {t('inv.number')}
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
                    {s.bills.map((b) => (
                      <tr key={b.id} data-bill={b.number}>
                        <td className={td}>
                          <Link
                            href={`${base}/supplier-bills/${b.id}`}
                            className="font-medium text-[var(--color-primary)] hover:underline"
                          >
                            <Ltr>{b.number}</Ltr>
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
              )}
            </Card>
          </>
        }
        side={
          <>
            <Card title={t('common.details')} id="supplier-details">
              <DescriptionList
                columns={1}
                items={[
                  { label: t('pur.phone'), value: s.phone ? <Ltr>{s.phone}</Ltr> : '—' },
                  { label: t('pur.email'), value: s.email ? <Ltr>{s.email}</Ltr> : '—' },
                  { label: t('pur.taxNumber'), value: s.taxNumber ? <Ltr>{s.taxNumber}</Ltr> : '—' },
                  {
                    label: t('pur.terms'),
                    value: t('pur.termsDays').replace('{n}', String(s.paymentTermsDays)),
                  },
                ]}
              />
            </Card>
            {s.canManage ? (
              <Card title={t('pur.editSupplier')} id="edit-supplier">
                <InlineForm
                  action={updateSupplierAction.bind(null, locale, companyId, s.id)}
                  locale={locale}
                  submitLabel={t('cust.save')}
                  submitClassName={buttonSecondary}
                  ariaLabel={t('pur.editSupplier')}
                >
                  <input type="hidden" name="version" value={s.version} />
                  <SupplierFields t={t} s={s} />
                  <label className={fieldLabel}>
                    {t('common.status')}
                    <select name="active" defaultValue={String(s.active)} className={`${inputClass} w-36`}>
                      <option value="true">{t('bay.active')}</option>
                      <option value="false">{t('bay.inactive')}</option>
                    </select>
                  </label>
                </InlineForm>
              </Card>
            ) : null}
          </>
        }
      />
    </>
  );
}
