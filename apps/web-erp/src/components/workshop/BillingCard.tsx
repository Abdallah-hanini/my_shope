import type { Invoice, JobBilling, JobCard } from '@erp/api-client';
import { createTranslator, formatDateTime, type Locale, type MessageKey } from '@erp/localization';
import Link from 'next/link';
import { randomUUID } from 'node:crypto';
import { billingAction, type BillingOp } from '@/app/[locale]/c/[companyId]/billing-actions';
import type { FormState } from '@/lib/form-state';
import { fill } from '@/lib/notifications';
import { Badge, buttonGhost, buttonSecondary, Card, inputClass, Ltr, fieldLabel } from '../ui';
import { InlineForm } from './InlineForm';

/** T-72 on the job card: invoice the approved quote, take payments, credit notes, handover. */
export function BillingCard({
  job,
  data,
  locale,
  companyId,
  timeZone,
}: {
  job: JobCard;
  data: JobBilling;
  locale: Locale;
  companyId: string;
  timeZone: string;
}) {
  const t = createTranslator(locale);
  const act = (op: BillingOp) => billingAction.bind(null, locale, companyId, job.id, op);
  const base = `/${locale}/c/${companyId}`;
  const live = data.documents.find((d) => d.kind === 'invoice' && !d.credited) ?? null;
  if (!data.documents.length && !data.approvedQuoteId && !['ready', 'delivered'].includes(job.status))
    return null;
  return (
    <Card title={t('bill.title')} id="billing">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm" data-clearance>
        {data.clearedForDelivery ? (
          <Badge tone="success">{data.unpaidRelease ? t('bill.released') : t('bill.paid')}</Badge>
        ) : live ? (
          <Badge tone="warning">{fill(t('bill.owed'), { amount: `${live.balance} ${live.currency}` })}</Badge>
        ) : (
          <Badge>{t('bill.notInvoiced')}</Badge>
        )}
        {data.unpaidRelease ? (
          <span className="text-xs text-[var(--color-text-muted)]">
            {data.unpaidRelease.byName} · {data.unpaidRelease.reason} ·{' '}
            {formatDateTime(locale, data.unpaidRelease.at, timeZone)}
          </span>
        ) : null}
      </div>
      {data.missingAccounts.length && (data.canInvoice || live) ? (
        <p role="note" className="mb-3 text-sm">
          {t('bill.missingAccounts')}{' '}
          <Link href={`${base}/settings/posting`} className="text-[var(--color-primary)] underline">
            {t('posting.title')}
          </Link>
        </p>
      ) : null}
      {data.canInvoice && data.approvedQuoteId ? (
        <InlineForm
          action={act({ kind: 'invoice', quoteId: data.approvedQuoteId })}
          locale={locale}
          submitLabel={fill(t('bill.createInvoice'), {
            quote: data.approvedQuoteNumber ?? '',
            amount: `${data.approvedQuoteTotal} ${data.currency}`,
          })}
          ariaLabel={t('bill.invoiceAction')}
        />
      ) : !live && !data.approvedQuoteId && ['ready', 'delivered'].includes(job.status) ? (
        <p className="mb-3 text-sm text-[var(--color-text-muted)]">{t('bill.needsQuote')}</p>
      ) : null}
      {data.documents.map((d) => (
        <DocView key={d.id} d={d} locale={locale} act={act} base={base} jobId={job.id} timeZone={timeZone} />
      ))}
      {data.canReleaseUnpaid ? (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium">{t('bill.release')}</summary>
          <InlineForm
            action={act({ kind: 'release' })}
            locale={locale}
            submitLabel={t('bill.release')}
            submitClassName={buttonSecondary}
            ariaLabel={t('bill.release')}
          >
            <input type="hidden" name="version" value={job.version} />
            <label className={fieldLabel}>
              {t('bill.releaseReason')}
              <input name="reason" maxLength={500} className={`${inputClass} w-72`} />
            </label>
          </InlineForm>
        </details>
      ) : null}
    </Card>
  );
}

function DocView({
  d,
  locale,
  act,
  base,
  jobId,
  timeZone,
}: {
  d: Invoice;
  locale: Locale;
  act: (op: BillingOp) => (s: FormState, f: FormData) => Promise<FormState>;
  base: string;
  jobId: string;
  timeZone: string;
}) {
  const t = createTranslator(locale);
  const credit = d.kind === 'credit_note';
  return (
    <section
      className="mb-4 rounded-[var(--radius-control)] border border-[var(--color-border)] p-4"
      data-invoice={d.number}
      aria-label={d.number}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
        <strong>{d.number}</strong>
        <Badge
          tone={credit ? 'neutral' : d.credited ? 'danger' : Number(d.balance) > 0 ? 'warning' : 'success'}
        >
          {credit
            ? t('bill.creditNote')
            : d.credited
              ? t('bill.cancelled')
              : Number(d.balance) > 0
                ? t('bill.unpaid')
                : t('bill.paidInvoice')}
        </Badge>
        <span>{d.invoiceDate}</span>
        <span>
          · {t('quote.total')} <Ltr>{`${d.total} ${d.currency}`}</Ltr>
        </span>
        {!credit && !d.credited ? (
          <span data-balance>
            · {t('bill.balance')} <Ltr>{`${d.balance} ${d.currency}`}</Ltr>
          </span>
        ) : null}
        <span className="text-xs text-[var(--color-text-muted)]">· {d.journalNumber}</span>
        <Link href={`${base}/jobs/${jobId}/invoices/${d.id}/print`} className={`${buttonGhost} ms-auto`}>
          {credit ? t('bill.printCredit') : t('bill.printInvoice')}
        </Link>
      </div>
      {credit ? (
        <p className="text-xs">
          {fill(t('bill.cancels'), { number: d.creditOfNumber ?? '' })} — {d.reason}
        </p>
      ) : null}
      {d.payments.length ? (
        <ul className="mb-2 flex flex-col gap-1 text-sm">
          {d.payments.map((p) => (
            <li key={p.id} data-payment={p.number}>
              {p.number} · {t(`bill.method.${p.method}` as MessageKey)} ·{' '}
              <Ltr>{`${p.amount} ${d.currency}`}</Ltr>
              {p.reference ? ` · ${p.reference}` : ''} · {p.receivedByName} ·{' '}
              {formatDateTime(locale, p.receivedAt, timeZone)}
            </li>
          ))}
        </ul>
      ) : null}
      {d.actions.includes('pay') ? (
        <InlineForm
          action={act({ kind: 'pay', invoiceId: d.id })}
          locale={locale}
          submitLabel={t('bill.recordPayment')}
          ariaLabel={`${t('bill.recordPayment')} ${d.number}`}
        >
          <input type="hidden" name="idempotencyKey" value={randomUUID()} />
          <label className={fieldLabel}>
            {t('bill.method')}
            <select name="method" defaultValue="cash" className={`${inputClass} w-36`}>
              {(['cash', 'card', 'bank'] as const).map((m) => (
                <option key={m} value={m}>
                  {t(`bill.method.${m}`)}
                </option>
              ))}
            </select>
          </label>
          <label className={fieldLabel}>
            {`${t('quote.amount')} (${d.currency})`}
            <input
              name="amount"
              defaultValue={d.balance}
              inputMode="decimal"
              dir="ltr"
              className={`${inputClass} w-32`}
            />
          </label>
          <label className={fieldLabel}>
            {t('bill.reference')}
            <input name="reference" maxLength={80} dir="ltr" className={`${inputClass} w-40`} />
          </label>
        </InlineForm>
      ) : null}
      {d.actions.includes('credit') ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-medium">{t('bill.issueCredit')}</summary>
          <InlineForm
            action={act({ kind: 'credit', invoiceId: d.id })}
            locale={locale}
            submitLabel={t('bill.issueCredit')}
            submitClassName={buttonSecondary}
            ariaLabel={`${t('bill.issueCredit')} ${d.number}`}
          >
            <label className={fieldLabel}>
              {t('bill.creditReason')}
              <input name="reason" maxLength={500} className={`${inputClass} w-72`} />
            </label>
          </InlineForm>
        </details>
      ) : null}
    </section>
  );
}
