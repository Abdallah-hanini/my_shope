import type { JobParts } from '@erp/api-client';
import { createTranslator, type Locale, type MessageKey } from '@erp/localization';
import { randomUUID } from 'node:crypto';
import { jobPartAction, type JobPartOp } from '@/app/[locale]/c/[companyId]/inventory-actions';
import { Badge, buttonSecondary, Card, inputClass, Ltr, Table, td, tdNum, th, thNum } from '../ui';
import { InlineForm } from './InlineForm';

const tone = { reserved: 'warning', issued: 'success', returned: 'neutral', released: 'neutral' } as const;

/** T-75 parts on the job card: reserve from the branch stock, then issue, release or return. */
export function JobPartsCard({
  jobId,
  data,
  locale,
  companyId,
}: {
  jobId: string;
  data: JobParts;
  locale: Locale;
  companyId: string;
}) {
  const t = createTranslator(locale);
  const act = (op: JobPartOp) => jobPartAction.bind(null, locale, companyId, jobId, op);
  if (!data.parts.length && !data.canAdd) return null;
  const label = { release: t('jp.release'), issue: t('jp.issue'), return: t('jp.return') } as const;
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
                    {(['issue', 'release', 'return'] as const)
                      .filter((a) => x.actions.includes(a))
                      .map((a) => (
                        <InlineForm
                          key={a}
                          action={act({ kind: a, jobPartId: x.id })}
                          locale={locale}
                          submitLabel={label[a]}
                          submitClassName={a === 'issue' ? undefined : buttonSecondary}
                          ariaLabel={`${label[a]} ${x.sku}`}
                        >
                          {a === 'release' ? null : (
                            <input type="hidden" name="idempotencyKey" value={randomUUID()} />
                          )}
                        </InlineForm>
                      ))}
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
    </Card>
  );
}
