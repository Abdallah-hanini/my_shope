import { unwrap } from '@erp/api-client';
import { createTranslator, formatDateTime, isLocale, type MessageKey } from '@erp/localization';
import { randomUUID } from 'node:crypto';
import { ArrowLeftRight } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProblemNotice } from '@/components/ProblemNotice';
import {
  Badge,
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
  Tabs,
} from '@/components/ui';
import { InlineForm } from '@/components/workshop/InlineForm';
import { attempt } from '@/lib/api';
import { loadCompany } from '@/lib/context';
import { sendTransferAction } from '../inventory-actions';

const ROWS = [0, 1, 2, 3, 4];

/** Stock transfers between branches: in transit or all, and sending stock (T-78). */
export default async function TransfersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; companyId: string }>;
  searchParams: Promise<{ status?: string; from?: string }>;
}) {
  const { locale, companyId } = await params;
  if (!isLocale(locale)) notFound();
  const sp = await searchParams;
  const status = sp.status === 'all' ? 'all' : 'open';
  const t = createTranslator(locale);
  const ctx = await loadCompany(companyId);
  if (!ctx.ok) return null;
  const { api, company } = ctx.data;
  const res = await attempt(async () =>
    unwrap(
      await api.GET('/api/v1/companies/{companyId}/transfers', {
        params: { path: { companyId }, query: { status } },
      }),
    ),
  );
  if (!res.ok) return <ProblemNotice result={res} locale={locale} />;
  const d = res.data;
  const from = d.fromBranches.find((b) => b.id === sp.from) ?? d.fromBranches[0] ?? null;
  const stock = from
    ? await attempt(async () =>
        unwrap(
          await api.GET('/api/v1/companies/{companyId}/parts', {
            params: { path: { companyId }, query: { branchId: from.id } },
          }),
        ),
      )
    : null;
  const choices = stock?.ok ? stock.data.parts.filter((x) => Number(x.onHand) > 0) : [];
  const base = `/${locale}/c/${companyId}`;
  return (
    <>
      <PageHeader title={t('tr.title')}>{t('tr.help')}</PageHeader>
      {from ? (
        <Card title={t('tr.send')} id="send" className="mb-6">
          {d.fromBranches.length > 1 ? (
            <nav className="mb-3 flex flex-wrap gap-2 text-sm" aria-label={t('tr.from')}>
              {d.fromBranches.map((b) => (
                <Link
                  key={b.id}
                  href={`${base}/transfers?from=${b.id}#send`}
                  aria-current={b.id === from.id ? 'page' : undefined}
                  className={
                    b.id === from.id
                      ? 'font-semibold underline'
                      : 'text-[var(--color-primary)] hover:underline'
                  }
                >
                  {`${t('tr.from')} ${b.code}`}
                </Link>
              ))}
            </nav>
          ) : null}
          {choices.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">{t('tr.nothing')}</p>
          ) : (
            <InlineForm
              action={sendTransferAction.bind(null, locale, companyId, from.id)}
              locale={locale}
              submitLabel={t('tr.send')}
              className="flex flex-col gap-3"
              ariaLabel={t('tr.send')}
            >
              <input type="hidden" name="idempotencyKey" value={randomUUID()} />
              <div className="flex flex-wrap items-end gap-3">
                <p className="text-sm">
                  {t('tr.from')} <strong>{from.code}</strong>
                </p>
                <label className={fieldLabel}>
                  {t('tr.to')}
                  <select name="toBranchId" className={`${inputClass} w-36`}>
                    {d.toBranches
                      .filter((b) => b.id !== from.id)
                      .map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.code}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
              {ROWS.map((i) => (
                <div key={i} className="flex flex-wrap items-end gap-3" data-transfer-row={i}>
                  <label className={fieldLabel}>
                    {`${t('inv.sku')} ${i + 1}`}
                    <select name={`part${i}`} defaultValue="" className={`${inputClass} w-72`}>
                      <option value="">—</option>
                      {choices.map((c) => (
                        <option key={c.id} value={c.id}>
                          {`${c.sku} — ${c.name} (${c.onHand} ${t(`inv.unit.${c.unit}` as MessageKey)})`}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={fieldLabel}>
                    {`${t('inv.quantity')} ${i + 1}`}
                    <input
                      name={`quantity${i}`}
                      inputMode="decimal"
                      dir="ltr"
                      className={`${inputClass} w-24`}
                    />
                  </label>
                </div>
              ))}
              <label className={fieldLabel}>
                {t('tr.note')}
                <input name="note" maxLength={300} className={`${inputClass} w-full max-w-md`} />
              </label>
            </InlineForm>
          )}
        </Card>
      ) : null}
      <Tabs
        label={t('tr.title')}
        items={[
          { href: `${base}/transfers`, label: t('tr.inTransit'), current: status === 'open' },
          { href: `${base}/transfers?status=all`, label: t('tr.all'), current: status === 'all' },
        ]}
      />
      {d.transfers.length === 0 ? (
        <EmptyState icon={<ArrowLeftRight aria-hidden size={18} />}>{t('tr.none')}</EmptyState>
      ) : (
        <Card title={t('tr.title')} flush>
          <Table caption={t('tr.title')}>
            <thead>
              <tr>
                <th scope="col" className={th}>
                  {t('inv.number')}
                </th>
                <th scope="col" className={th}>
                  {t('tr.route')}
                </th>
                <th scope="col" className={thNum}>
                  {t('inv.value')}
                </th>
                <th scope="col" className={th}>
                  {t('tr.sent')}
                </th>
                <th scope="col" className={th}>
                  {t('common.status')}
                </th>
              </tr>
            </thead>
            <tbody>
              {d.transfers.map((x) => (
                <tr key={x.id} data-transfer={x.number} data-status={x.status}>
                  <td className={td}>
                    <Link
                      href={`${base}/transfers/${x.id}`}
                      className="font-medium text-[var(--color-primary)] hover:underline"
                    >
                      <Ltr>{x.number}</Ltr>
                    </Link>
                  </td>
                  <td className={td}>
                    <Ltr>{`${x.fromBranchCode} → ${x.toBranchCode}`}</Ltr>
                  </td>
                  <td className={tdNum}>
                    <Ltr>{x.value}</Ltr>
                  </td>
                  <td className={td}>
                    {x.dispatchedByName} · {formatDateTime(locale, x.dispatchedAt, company.timezone)}
                  </td>
                  <td className={td}>
                    <Badge
                      tone={
                        x.status === 'in_transit'
                          ? 'warning'
                          : x.status === 'received'
                            ? 'success'
                            : 'neutral'
                      }
                    >
                      {t(`tr.status.${x.status}` as MessageKey)}
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
