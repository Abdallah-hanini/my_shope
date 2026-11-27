import { unwrap } from '@erp/api-client';
import { createTranslator, formatDateTime, isLocale, type MessageKey } from '@erp/localization';
import { randomUUID } from 'node:crypto';
import { notFound } from 'next/navigation';
import { ProblemNotice } from '@/components/ProblemNotice';
import {
  Badge,
  buttonSecondary,
  Card,
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
} from '@/components/ui';
import { InlineForm } from '@/components/workshop/InlineForm';
import { attempt } from '@/lib/api';
import { loadCompany } from '@/lib/context';
import { partAction, type PartOp } from '../../inventory-actions';

const UUID = /^[0-9a-f-]{36}$/i;

/** A part: stock per branch with receipts and counted adjustments, and its movements (T-74). */
export default async function PartPage({
  params,
}: {
  params: Promise<{ locale: string; companyId: string; partId: string }>;
}) {
  const { locale, companyId, partId } = await params;
  if (!isLocale(locale) || !UUID.test(partId)) notFound();
  const t = createTranslator(locale);
  const ctx = await loadCompany(companyId);
  if (!ctx.ok) return null;
  const { api, company } = ctx.data;
  const res = await attempt(async () =>
    unwrap(
      await api.GET('/api/v1/companies/{companyId}/parts/{partId}', {
        params: { path: { companyId, partId } },
      }),
    ),
  );
  if (!res.ok) return res.status === 404 ? notFound() : <ProblemNotice result={res} locale={locale} />;
  const p = res.data;
  const act = (op: PartOp) => partAction.bind(null, locale, companyId, p.id, op);
  const unit = t(`inv.unit.${p.unit}` as MessageKey);
  return (
    <>
      <PageHeader title={`${p.sku} — ${locale === 'ar' && p.nameAr ? p.nameAr : p.name}`}>
        <span className="inline-flex flex-wrap items-center gap-2">
          {p.active ? null : <Badge>{t('bay.inactive')}</Badge>}
          {p.brand ? <span>{p.brand} ·</span> : null}
          <span>{unit}</span>·
          <span>
            {t('inv.onHand')} <Ltr>{p.onHand}</Ltr> · {t('inv.value')}{' '}
            <Ltr>{`${p.value} ${company.baseCurrency}`}</Ltr>
          </span>
        </span>
      </PageHeader>
      <SplitLayout
        main={
          <>
            {p.branches.map((b) => (
              <Card
                key={b.branchId}
                title={`${t('job.branch')} ${b.branchCode}`}
                id={`stock-${b.branchCode}`}
              >
                <p className="mb-3 text-sm" data-branch-stock={b.branchCode}>
                  {t('inv.onHand')}:{' '}
                  <strong>
                    <Ltr>{`${b.onHand} ${unit}`}</Ltr>
                  </strong>{' '}
                  · {t('jp.reserved')}: <Ltr>{b.reserved}</Ltr> · {t('inv.avgCost')}:{' '}
                  <Ltr>{b.averageCost ?? '—'}</Ltr> · {t('inv.value')}:{' '}
                  <Ltr>{`${b.value} ${company.baseCurrency}`}</Ltr>
                </p>
                <p className="mb-3 text-sm text-[var(--color-text-muted)]" data-reorder={b.branchCode}>
                  {b.minQuantity ? (
                    <>
                      {t('plan.reorderPoint')}: <Ltr>{`${b.minQuantity} ${unit}`}</Ltr> ·{' '}
                      {t('plan.reorderQty')}: <Ltr>{`${b.reorderQuantity} ${unit}`}</Ltr>
                    </>
                  ) : (
                    t('plan.noReorderPoint')
                  )}
                </p>
                <div className="flex flex-col gap-4">
                  {b.canReceive ? (
                    <InlineForm
                      action={act({ kind: 'receive', branchId: b.branchId })}
                      locale={locale}
                      submitLabel={t('inv.receive')}
                      ariaLabel={`${t('inv.receive')} ${b.branchCode}`}
                    >
                      <input type="hidden" name="idempotencyKey" value={randomUUID()} />
                      <label className={fieldLabel}>
                        {t('pur.supplier')}
                        <select name="supplierId" defaultValue="" className={`${inputClass} w-48`}>
                          <option value="">{t('pur.noSupplier')}</option>
                          {p.suppliers.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className={fieldLabel}>
                        {`${t('inv.quantity')} (${unit})`}
                        <input
                          name="quantity"
                          inputMode="decimal"
                          dir="ltr"
                          className={`${inputClass} w-28`}
                        />
                      </label>
                      <label className={fieldLabel}>
                        {`${t('inv.unitCost')} (${company.baseCurrency})`}
                        <input
                          name="unitCost"
                          inputMode="decimal"
                          dir="ltr"
                          className={`${inputClass} w-28`}
                        />
                      </label>
                      <label className={fieldLabel}>
                        {t('inv.reference')}
                        <input name="reference" maxLength={80} dir="ltr" className={`${inputClass} w-44`} />
                      </label>
                    </InlineForm>
                  ) : null}
                  {b.canSetReorder ? (
                    <details>
                      <summary className="cursor-pointer text-sm font-medium">
                        {t('plan.setReorderPoint')}
                      </summary>
                      <InlineForm
                        action={act({ kind: 'reorder', branchId: b.branchId })}
                        locale={locale}
                        submitLabel={t('cust.save')}
                        submitClassName={buttonSecondary}
                        ariaLabel={`${t('plan.setReorderPoint')} ${b.branchCode}`}
                      >
                        {b.reorderVersion ? (
                          <input type="hidden" name="version" value={b.reorderVersion} />
                        ) : null}
                        <label className={fieldLabel}>
                          {`${t('plan.reorderPoint')} (${unit})`}
                          <input
                            name="minQuantity"
                            defaultValue={b.minQuantity ?? ''}
                            inputMode="decimal"
                            dir="ltr"
                            className={`${inputClass} w-28`}
                          />
                        </label>
                        <label className={fieldLabel}>
                          {`${t('plan.reorderQty')} (${unit})`}
                          <input
                            name="reorderQuantity"
                            defaultValue={b.reorderQuantity ?? ''}
                            inputMode="decimal"
                            dir="ltr"
                            className={`${inputClass} w-28`}
                          />
                        </label>
                      </InlineForm>
                      {b.minQuantity ? (
                        <InlineForm
                          action={act({ kind: 'reorderRemove', branchId: b.branchId })}
                          locale={locale}
                          submitLabel={t('plan.removeReorderPoint')}
                          submitClassName={buttonSecondary}
                          ariaLabel={`${t('plan.removeReorderPoint')} ${b.branchCode}`}
                        >
                          {null}
                        </InlineForm>
                      ) : null}
                    </details>
                  ) : null}
                  {b.canAdjust ? (
                    <details>
                      <summary className="cursor-pointer text-sm font-medium">{t('inv.adjust')}</summary>
                      <InlineForm
                        action={act({ kind: 'adjust', branchId: b.branchId })}
                        locale={locale}
                        submitLabel={t('inv.adjust')}
                        submitClassName={buttonSecondary}
                        ariaLabel={`${t('inv.adjust')} ${b.branchCode}`}
                      >
                        <input type="hidden" name="idempotencyKey" value={randomUUID()} />
                        <label className={fieldLabel}>
                          {t('inv.direction')}
                          <select name="direction" defaultValue="out" className={`${inputClass} w-40`}>
                            <option value="out">{t('inv.out')}</option>
                            <option value="in">{t('inv.in')}</option>
                          </select>
                        </label>
                        <label className={fieldLabel}>
                          {`${t('inv.quantity')} (${unit})`}
                          <input
                            name="quantity"
                            inputMode="decimal"
                            dir="ltr"
                            className={`${inputClass} w-28`}
                          />
                        </label>
                        <label className={fieldLabel}>
                          {t('inv.foundCost')}
                          <input
                            name="unitCost"
                            inputMode="decimal"
                            dir="ltr"
                            className={`${inputClass} w-28`}
                          />
                        </label>
                        <label className={fieldLabel}>
                          {t('inv.reason')}
                          <input name="reason" maxLength={300} className={`${inputClass} w-56`} />
                        </label>
                      </InlineForm>
                    </details>
                  ) : null}
                </div>
              </Card>
            ))}
            <Card title={t('inv.movements')} id="movements" flush>
              <Table caption={t('inv.movements')}>
                <thead>
                  <tr>
                    <th scope="col" className={th}>
                      {t('inv.number')}
                    </th>
                    <th scope="col" className={th}>
                      {t('job.branch')}
                    </th>
                    <th scope="col" className={th}>
                      {t('inv.kind')}
                    </th>
                    <th scope="col" className={thNum}>
                      {t('inv.quantity')}
                    </th>
                    <th scope="col" className={thNum}>
                      {t('inv.value')}
                    </th>
                    <th scope="col" className={thNum}>
                      {t('inv.onHandAfter')}
                    </th>
                    <th scope="col" className={th}>
                      {t('inv.details')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {p.movements.map((m) => (
                    <tr key={m.id} data-movement={m.number}>
                      <td className={td}>
                        <Ltr>{m.number}</Ltr>
                      </td>
                      <td className={td}>{m.branchCode}</td>
                      <td className={td}>{t(`inv.kind.${m.kind}` as MessageKey)}</td>
                      <td className={tdNum}>
                        <Ltr>
                          {['adjustment_out', 'issue', 'transfer_out'].includes(m.kind)
                            ? `−${m.quantity}`
                            : m.quantity}
                        </Ltr>
                      </td>
                      <td className={tdNum}>
                        <Ltr>{m.value}</Ltr>
                      </td>
                      <td className={tdNum}>
                        <Ltr>{m.onHandAfter}</Ltr>
                      </td>
                      <td className={td}>
                        <span className="text-xs">
                          {m.supplierName ? `${m.supplierName} · ` : ''}
                          {m.reference ?? m.reason} · {m.journalNumber} · {m.createdByName} ·{' '}
                          {formatDateTime(locale, m.createdAt, company.timezone)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          </>
        }
        side={
          <>
            <Card title={t('jp.salePrice')} id="price">
              <p className="mb-3 text-sm" data-sale-price>
                {p.salePrice ? (
                  <Ltr>{`${p.salePrice} ${company.baseCurrency} / ${unit}`}</Ltr>
                ) : (
                  t('jp.noPrice')
                )}
              </p>
              {p.canSetPrice ? (
                <InlineForm
                  action={act({ kind: 'price' })}
                  locale={locale}
                  submitLabel={t('cust.save')}
                  submitClassName={buttonSecondary}
                  ariaLabel={t('jp.salePrice')}
                >
                  <input type="hidden" name="version" value={p.version} />
                  <label className={fieldLabel}>
                    {`${t('jp.salePrice')} (${company.baseCurrency})`}
                    <input
                      name="salePrice"
                      defaultValue={p.salePrice ?? ''}
                      inputMode="decimal"
                      dir="ltr"
                      className={`${inputClass} w-32`}
                    />
                  </label>
                </InlineForm>
              ) : null}
            </Card>
            {p.canEdit ? (
              <Card title={t('inv.editPart')} id="edit-part">
                <InlineForm
                  action={act({ kind: 'update' })}
                  locale={locale}
                  submitLabel={t('cust.save')}
                  submitClassName={buttonSecondary}
                  ariaLabel={t('inv.editPart')}
                >
                  <input type="hidden" name="version" value={p.version} />
                  <label className={fieldLabel}>
                    {t('bay.name')}
                    <input
                      name="name"
                      defaultValue={p.name}
                      maxLength={200}
                      className={`${inputClass} w-56`}
                    />
                  </label>
                  <label className={fieldLabel}>
                    {t('settings.nameAr')}
                    <input
                      name="nameAr"
                      defaultValue={p.nameAr ?? ''}
                      dir="rtl"
                      maxLength={200}
                      className={`${inputClass} w-48`}
                    />
                  </label>
                  <label className={fieldLabel}>
                    {t('inv.brand')}
                    <input
                      name="brand"
                      defaultValue={p.brand ?? ''}
                      maxLength={80}
                      className={`${inputClass} w-36`}
                    />
                  </label>
                  <label className={fieldLabel}>
                    {t('common.status')}
                    <select name="active" defaultValue={String(p.active)} className={`${inputClass} w-36`}>
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
