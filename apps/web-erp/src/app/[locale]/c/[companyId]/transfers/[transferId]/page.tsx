import { unwrap } from '@erp/api-client';
import { createTranslator, formatDateTime, isLocale, type MessageKey } from '@erp/localization';
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
} from '@/components/ui';
import { InlineForm } from '@/components/workshop/InlineForm';
import { attempt } from '@/lib/api';
import { loadCompany } from '@/lib/context';
import { transferAction } from '../../inventory-actions';

const UUID = /^[0-9a-f-]{36}$/i;

/** A stock transfer: lines with their movements; receive (receiving branch) or cancel (sender) (T-78). */
export default async function TransferPage({
  params,
}: {
  params: Promise<{ locale: string; companyId: string; transferId: string }>;
}) {
  const { locale, companyId, transferId } = await params;
  if (!isLocale(locale) || !UUID.test(transferId)) notFound();
  const t = createTranslator(locale);
  const ctx = await loadCompany(companyId);
  if (!ctx.ok) return null;
  const { api, company } = ctx.data;
  const res = await attempt(async () =>
    unwrap(
      await api.GET('/api/v1/companies/{companyId}/transfers/{transferId}', {
        params: { path: { companyId, transferId } },
      }),
    ),
  );
  if (!res.ok) return res.status === 404 ? notFound() : <ProblemNotice result={res} locale={locale} />;
  const x = res.data;
  const tz = company.timezone;
  return (
    <>
      <PageHeader title={`${x.number} · ${x.fromBranchCode} → ${x.toBranchCode}`}>
        <span className="inline-flex flex-wrap items-center gap-2" data-transfer-status={x.status}>
          <Badge
            tone={x.status === 'in_transit' ? 'warning' : x.status === 'received' ? 'success' : 'neutral'}
          >
            {t(`tr.status.${x.status}` as MessageKey)}
          </Badge>
          <span>
            {t('tr.sent')}: {x.dispatchedByName} · {formatDateTime(locale, x.dispatchedAt, tz)}
            {x.receivedAt
              ? ` · ${t('tr.received')}: ${x.receivedByName} · ${formatDateTime(locale, x.receivedAt, tz)}`
              : ''}
          </span>
        </span>
      </PageHeader>
      {x.note ? <p className="mb-4 text-sm">{x.note}</p> : null}
      {x.cancelReason ? (
        <p className="mb-4 text-sm">
          {t('tr.cancelledBy')} {x.cancelledByName}: {x.cancelReason}
        </p>
      ) : null}
      <Card title={t('tr.lines')} id="lines" flush>
        <Table caption={t('tr.lines')}>
          <thead>
            <tr>
              <th scope="col" className={th}>
                {t('inv.sku')}
              </th>
              <th scope="col" className={thNum}>
                {t('inv.quantity')}
              </th>
              <th scope="col" className={thNum}>
                {t('inv.value')}
              </th>
              <th scope="col" className={th}>
                {t('inv.movements')}
              </th>
            </tr>
          </thead>
          <tbody>
            {x.lines.map((l) => (
              <tr key={l.lineNo} data-transfer-line={l.sku}>
                <td className={td}>
                  <Ltr>{l.sku}</Ltr> {l.partName}
                </td>
                <td className={tdNum}>
                  <Ltr>{`${l.quantity} ${t(`inv.unit.${l.unit}` as MessageKey)}`}</Ltr>
                </td>
                <td className={tdNum}>
                  <Ltr>{l.value}</Ltr>
                </td>
                <td className={td}>
                  <Ltr>{[l.outNumber, l.inNumber, l.backNumber].filter(Boolean).join(' · ')}</Ltr>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
      {x.actions.includes('receive') ? (
        <Card title={t('tr.receive')} id="receive">
          <p className="mb-3 text-sm text-[var(--color-text-muted)]">{t('tr.receiveHelp')}</p>
          <InlineForm
            action={transferAction.bind(null, locale, companyId, x.id, 'receive')}
            locale={locale}
            submitLabel={t('tr.receive')}
            ariaLabel={t('tr.receive')}
          />
        </Card>
      ) : null}
      {x.actions.includes('cancel') ? (
        <Card title={t('tr.cancel')} id="cancel">
          <p className="mb-3 text-sm text-[var(--color-text-muted)]">{t('tr.cancelHelp')}</p>
          <InlineForm
            action={transferAction.bind(null, locale, companyId, x.id, 'cancel')}
            locale={locale}
            submitLabel={t('tr.cancel')}
            submitClassName={buttonSecondary}
            ariaLabel={t('tr.cancel')}
          >
            <label className={fieldLabel}>
              {t('inv.reason')}
              <input name="reason" maxLength={300} className={`${inputClass} w-72`} />
            </label>
          </InlineForm>
        </Card>
      ) : null}
    </>
  );
}
