import type { JobParts } from '@erp/api-client';
import { createTranslator, formatDateTime, type Locale, type MessageKey } from '@erp/localization';
import { randomUUID } from 'node:crypto';
import { jobPartAction, type JobPartOp } from '@/app/[locale]/c/[companyId]/inventory-actions';
import { Badge, buttonSecondary, Card, inputClass, Ltr, Table, td, tdNum, th, thNum } from '../ui';
import { InlineForm } from './InlineForm';

const tone = {
  ordered: 'info',
  reserved: 'warning',
  issued: 'success',
  returned: 'neutral',
  released: 'neutral',
  cancelled: 'neutral',
} as const;

/**
 * Parts on the job card: reserve from the branch stock, then issue, release or return (T-75); order
 * a part the branch has too little of, reserved automatically when it arrives (T-77).
 */
export function JobPartsCard({
  jobId,
  data,
  locale,
  companyId,
  timeZone,
}: {
  jobId: string;
  data: JobParts;
  locale: Locale;
  companyId: string;
  timeZone: string;
}) {
  const t = createTranslator(locale);
  const act = (op: JobPartOp) => jobPartAction.bind(null, locale, companyId, jobId, op);
  if (!data.parts.length && !data.canAdd && !data.canOrder) return null;
  const label = {
    release: t('jp.release'),
    issue: t('jp.issue'),
    return: t('jp.return'),
    allocate: t('so.allocate'),
  } as const;
  const field = 'flex flex-col gap-1 text-[13px] font-medium';
  return (
    <Card title={t('jp.title')} id="parts" flush>
      {data.parts.length ? (
        <Table caption={t('jp.title')}>
          <thead>
            <tr>
              <th scope="col" className={th}>
                {t('inv.sku')}
              </th>
              <th scope="col" className={thNum}>
                {t('inv.quantity')}
              </th>
              <th scope="col" className={th}>
                {t('common.status')}
              </th>
              <th scope="col" className={thNum}>
                {t('jp.cost')}
              </th>
              <th scope="col" className={th}>
                {t('common.actions')}
              </th>
            </tr>
          </thead>
          <tbody>
            {data.parts.map((x) => (
              <tr key={x.id} data-job-part={x.sku} data-status={x.status}>
                <td className={td}>
                  <Ltr>{x.sku}</Ltr> {x.name}
                  {x.salePrice ? (
                    <span className="block text-xs text-[var(--color-text-muted)]">{`${t('jp.price')} ${x.salePrice}`}</span>
                  ) : null}
                </td>
                <td className={tdNum}>
                  <Ltr>{`${x.quantity} ${t(`inv.unit.${x.unit}` as MessageKey)}`}</Ltr>
                </td>
                <td className={td}>
                  <Badge tone={tone[x.status as keyof typeof tone] ?? 'neutral'}>
                    {t(`jp.status.${x.status}` as MessageKey)}
                  </Badge>
                  {x.orderedAt ? (
                    <span className="block text-xs text-[var(--color-text-muted)]" data-order>
                      {t('so.ordered')} {formatDateTime(locale, x.orderedAt, timeZone)}
                      {x.supplierName ? ` · ${x.supplierName}` : ''}
                      {x.orderRef ? ` · ${x.orderRef}` : ''}
                      {x.arrivedAt
                        ? ` · ${t('so.arrived')} ${formatDateTime(locale, x.arrivedAt, timeZone)}`
                        : ''}
                      {x.cancelReason ? ` · ${x.cancelReason}` : ''}
                    </span>
                  ) : null}
                  {x.issueNumber ? (
                    <span className="block text-xs text-[var(--color-text-muted)]">
                      {x.issueNumber}
                      {x.returnNumber ? ` · ${x.returnNumber}` : ''}
                    </span>
                  ) : null}
                </td>
                <td className={tdNum}>
                  <Ltr>{x.cost ?? '—'}</Ltr>
                </td>
                <td className={td}>
                  <div className="flex flex-wrap gap-2">
                    {(['issue', 'allocate', 'release', 'return'] as const)
                      .filter((a) => x.actions.includes(a))
                      .map((a) => (
                        <InlineForm
                          key={a}
                          action={act({ kind: a, jobPartId: x.id })}
                          locale={locale}
                          submitLabel={label[a]}
                          submitClassName={a === 'issue' || a === 'allocate' ? undefined : buttonSecondary}
                          ariaLabel={`${label[a]} ${x.sku}`}
                        >
                          {a === 'release' || a === 'allocate' ? null : (
                            <input type="hidden" name="idempotencyKey" value={randomUUID()} />
                          )}
                        </InlineForm>
                      ))}
                    {x.actions.includes('cancelOrder') ? (
                      <details>
                        <summary className="cursor-pointer text-sm font-medium">{t('so.cancel')}</summary>
                        <InlineForm
                          action={act({ kind: 'cancelOrder', jobPartId: x.id })}
                          locale={locale}
                          submitLabel={t('so.cancel')}
                          submitClassName={buttonSecondary}
                          ariaLabel={`${t('so.cancel')} ${x.sku}`}
                        >
                          <label className={field}>
                            {t('inv.reason')}
                            <input name="reason" maxLength={300} className={`${inputClass} w-48`} />
                          </label>
                        </InlineForm>
                      </details>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : null}
      {data.canAdd ? (
        <div className="p-5">
          {data.choices.length ? (
            <InlineForm
              action={act({ kind: 'add' })}
              locale={locale}
              submitLabel={t('jp.reserve')}
              ariaLabel={t('jp.reserve')}
            >
              <label className="flex flex-col gap-1 text-[13px] font-medium">
                {t('jp.part')}
                <select name="partId" className={`${inputClass} w-72`}>
                  {data.choices.map((c) => (
                    <option key={c.partId} value={c.partId}>
                      {`${c.sku} — ${c.name} (${c.available} ${t(`inv.unit.${c.unit}` as MessageKey)})`}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[13px] font-medium">
                {t('inv.quantity')}
                <input name="quantity" inputMode="decimal" dir="ltr" className={`${inputClass} w-24`} />
              </label>
            </InlineForm>
          ) : (
            <p className="text-sm text-[var(--color-text-muted)]">{t('jp.noneAvailable')}</p>
          )}
        </div>
      ) : null}
      {data.canOrder && data.orderChoices.length ? (
        <div className="border-t border-[var(--color-border)] p-5">
          <p className="mb-2 text-sm text-[var(--color-text-muted)]">{t('so.help')}</p>
          <InlineForm
            action={act({ kind: 'order' })}
            locale={locale}
            submitLabel={t('so.order')}
            submitClassName={buttonSecondary}
            ariaLabel={t('so.order')}
          >
            <label className={field}>
              {t('so.part')}
              <select name="partId" className={`${inputClass} w-72`}>
                {data.orderChoices.map((c) => (
                  <option key={c.partId} value={c.partId}>
                    {`${c.sku} — ${c.name} (${c.available} ${t(`inv.unit.${c.unit}` as MessageKey)})`}
                  </option>
                ))}
              </select>
            </label>
            <label className={field}>
              {t('inv.quantity')}
              <input name="quantity" inputMode="decimal" dir="ltr" className={`${inputClass} w-24`} />
            </label>
            <label className={field}>
              {t('pur.supplier')}
              <select name="supplierId" defaultValue="" className={`${inputClass} w-44`}>
                <option value="">{t('so.noSupplier')}</option>
                {data.suppliers.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={field}>
              {t('so.orderRef')}
              <input name="orderRef" maxLength={80} dir="ltr" className={`${inputClass} w-32`} />
            </label>
          </InlineForm>
        </div>
      ) : null}
    </Card>
  );
}
