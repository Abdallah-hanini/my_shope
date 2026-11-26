import type { JobCard, JobQuotes, Quote } from '@erp/api-client';
import { createTranslator, formatDateTime, type Locale, type MessageKey } from '@erp/localization';
import Link from 'next/link';
import { quoteAction, type QuoteOp } from '@/app/[locale]/c/[companyId]/quote-actions';
import type { FormState } from '@/lib/form-state';
import { fill } from '@/lib/notifications';
import {
  Badge,
  buttonGhost,
  buttonSecondary,
  Card,
  inputClass,
  Ltr,
  Table,
  td,
  tdNum,
  th,
  thNum,
} from '../ui';
import { InlineForm } from './InlineForm';

const field = 'flex flex-col gap-1 text-[13px] font-medium';
const tone = {
  draft: 'neutral',
  issued: 'warning',
  approved: 'success',
  declined: 'danger',
  superseded: 'neutral',
} as const;

/** WMS-005 quote on the job card: the current draft or issued quote, its actions and history. */
export function QuoteCard({
  job,
  data,
  locale,
  companyId,
  timeZone,
}: {
  job: JobCard;
  data: JobQuotes;
  locale: Locale;
  companyId: string;
  timeZone: string;
}) {
  const t = createTranslator(locale);
  const act = (op: QuoteOp) => quoteAction.bind(null, locale, companyId, job.id, op);
  const base = `/${locale}/c/${companyId}`;
  const current =
    data.quotes.find((q) => q.status === 'draft') ??
    data.quotes.find((q) => q.status !== 'superseded') ??
    null;
  const older = data.quotes.filter((q) => q !== current);
  if (!current && !data.canCreate) return null;
  return (
    <Card title={t('quote.title')} id="quote">
      {!current ? <p className="mb-3 text-sm text-[var(--color-text-muted)]">{t('quote.none')}</p> : null}
      {data.canCreate && !data.labourRate ? (
        <p role="note" className="mb-3 text-sm">
          {t('quote.noRate')}{' '}
          <Link href={`${base}/settings/pricing`} className="text-[var(--color-primary)] underline">
            {t('settings.pricing')}
          </Link>
        </p>
      ) : null}
      {current ? (
        <QuoteView
          q={current}
          data={data}
          job={job}
          locale={locale}
          act={act}
          base={base}
          timeZone={timeZone}
        />
      ) : null}
      {data.canCreate ? (
        <InlineForm
          action={act({ kind: 'create' })}
          locale={locale}
          submitLabel={current ? t('quote.newRevision') : t('quote.create')}
          submitClassName={buttonSecondary}
          ariaLabel={t('quote.create')}
        />
      ) : null}
      {older.length ? (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium">{t('quote.history')}</summary>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {older.map((q) => (
              <li key={q.id}>
                {fill(t('quote.revision'), { n: String(q.revision) })} · {q.number ?? '—'} ·{' '}
                {t(`quote.status.${q.status}` as MessageKey)} · <Ltr>{`${q.total} ${q.currency}`}</Ltr>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </Card>
  );
}

function QuoteView({
  q,
  data,
  job,
  locale,
  act,
  base,
  timeZone,
}: {
  q: Quote;
  data: JobQuotes;
  job: JobCard;
  locale: Locale;
  act: (op: QuoteOp) => (s: FormState, f: FormData) => Promise<FormState>;
  base: string;
  timeZone: string;
}) {
  const t = createTranslator(locale);
  const can = (a: string) => q.actions.includes(a);
  const version = <input type="hidden" name="version" value={q.version} />;
  const edit = can('edit');
  const money = (v: string) => <Ltr>{`${v} ${q.currency}`}</Ltr>;
  return (
    <div className="mb-4 flex flex-col gap-3" data-quote={q.status}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <strong>{q.number ?? fill(t('quote.revision'), { n: String(q.revision) })}</strong>
        <Badge tone={tone[q.status as keyof typeof tone] ?? 'neutral'}>
          {t(`quote.status.${q.status}` as MessageKey)}
        </Badge>
        {q.quoteDate ? <span className="text-[var(--color-text-muted)]">{q.quoteDate}</span> : null}
        {q.number ? (
          <Link href={`${base}/jobs/${job.id}/quotes/${q.id}/print`} className={`${buttonGhost} ms-auto`}>
            {t('quote.print')}
          </Link>
        ) : null}
      </div>
      {edit ? (
        <InlineForm
          action={act({ kind: 'update', quoteId: q.id, taskIds: q.lines.map((l) => l.taskId) })}
          locale={locale}
          submitLabel={t('quote.saveDraft')}
          submitClassName={buttonSecondary}
          className="flex flex-col gap-3"
          ariaLabel={t('quote.edit')}
        >
          {version}
          <Table caption={t('quote.title')}>
            <thead>
              <tr>
                <th scope="col" className={th}>
                  {t('job.task')}
                </th>
                <th scope="col" className={thNum}>
                  {t('quote.hours')}
                </th>
                <th scope="col" className={thNum}>
                  {t('quote.rate')}
                </th>
                <th scope="col" className={thNum}>
                  {t('quote.amount')}
                </th>
                {edit ? (
                  <th scope="col" className={th}>
                    {t('quote.override')}
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {q.lines.map((l) => (
                <tr key={l.taskId} data-quote-line={l.lineNo}>
                  <td className={td}>
                    {l.lineNo}. {l.description}
                    {l.kind === 'part' ? (
                      <span className="ms-1 text-xs text-[var(--color-text-muted)]">
                        ({t('jp.partLine')})
                      </span>
                    ) : null}
                    {l.overrideReason ? (
                      <span className="block text-xs text-[var(--color-text-muted)]">{l.overrideReason}</span>
                    ) : null}
                  </td>
                  <td className={tdNum}>
                    <Ltr>{l.hours}</Ltr>
                  </td>
                  <td className={tdNum}>
                    <Ltr>{l.rate}</Ltr>
                  </td>
                  <td className={tdNum}>
                    <Ltr>{l.amount}</Ltr>
                  </td>
                  {edit ? (
                    <td className={td}>
                      <div className="flex flex-wrap gap-2">
                        <input
                          name={`override_${l.taskId}`}
                          defaultValue={l.overrideAmount ?? ''}
                          inputMode="decimal"
                          dir="ltr"
                          aria-label={`${t('quote.override')} ${l.lineNo}`}
                          className={`${inputClass} w-24`}
                        />
                        <input
                          name={`reason_${l.taskId}`}
                          defaultValue={l.overrideReason ?? ''}
                          aria-label={`${t('quote.overrideReason')} ${l.lineNo}`}
                          placeholder={t('quote.overrideReason')}
                          className={`${inputClass} w-40`}
                        />
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </Table>
          {edit ? (
            <div className="flex flex-wrap gap-3">
              <label className={field}>
                {`${t('quote.discount')} (%)`}
                <input
                  name="discountPct"
                  defaultValue={String(Number(q.discountPct))}
                  inputMode="decimal"
                  dir="ltr"
                  className={`${inputClass} w-24`}
                />
              </label>
              <label className={field}>
                {t('quote.discountReason')}
                <input
                  name="discountReason"
                  defaultValue={q.discountReason ?? ''}
                  maxLength={300}
                  className={`${inputClass} w-56`}
                />
              </label>
            </div>
          ) : null}
        </InlineForm>
      ) : (
        <Table caption={t('quote.title')}>
          <thead>
            <tr>
              <th scope="col" className={th}>
                {t('job.task')}
              </th>
              <th scope="col" className={thNum}>
                {t('quote.hours')}
              </th>
              <th scope="col" className={thNum}>
                {t('quote.rate')}
              </th>
              <th scope="col" className={thNum}>
                {t('quote.amount')}
              </th>
              {edit ? (
                <th scope="col" className={th}>
                  {t('quote.override')}
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {q.lines.map((l) => (
              <tr key={l.taskId} data-quote-line={l.lineNo}>
                <td className={td}>
                  {l.lineNo}. {l.description}
                  {l.kind === 'part' ? (
                    <span className="ms-1 text-xs text-[var(--color-text-muted)]">({t('jp.partLine')})</span>
                  ) : null}
                  {l.overrideReason ? (
                    <span className="block text-xs text-[var(--color-text-muted)]">{l.overrideReason}</span>
                  ) : null}
                </td>
                <td className={tdNum}>
                  <Ltr>{l.hours}</Ltr>
                </td>
                <td className={tdNum}>
                  <Ltr>{l.rate}</Ltr>
                </td>
                <td className={tdNum}>
                  <Ltr>{l.amount}</Ltr>
                </td>
                {edit ? (
                  <td className={td}>
                    <div className="flex flex-wrap gap-2">
                      <input
                        name={`override_${l.taskId}`}
                        defaultValue={l.overrideAmount ?? ''}
                        inputMode="decimal"
                        dir="ltr"
                        aria-label={`${t('quote.override')} ${l.lineNo}`}
                        className={`${inputClass} w-24`}
                      />
                      <input
                        name={`reason_${l.taskId}`}
                        defaultValue={l.overrideReason ?? ''}
                        aria-label={`${t('quote.overrideReason')} ${l.lineNo}`}
                        placeholder={t('quote.overrideReason')}
                        className={`${inputClass} w-40`}
                      />
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <dl className="ms-auto grid w-full max-w-sm grid-cols-2 gap-x-4 gap-y-1 text-sm" data-quote-totals>
        <dt>{t('quote.subtotal')}</dt>
        <dd className="text-end">{money(q.subtotal)}</dd>
        {Number(q.discountAmount) > 0 ? (
          <>
            <dt>{`${t('quote.discount')} ${Number(q.discountPct)} %`}</dt>
            <dd className="text-end">−{money(q.discountAmount)}</dd>
          </>
        ) : null}
        <dt>
          {q.taxCode
            ? `${t('quote.tax')} ${q.taxCode} ${Number(q.taxPct)} %${q.pricesIncludeTax ? ` (${t('quote.included')})` : ''}`
            : t('quote.noTax')}
        </dt>
        <dd className="text-end">{money(q.taxAmount)}</dd>
        <dt className="font-semibold">{t('quote.total')}</dt>
        <dd className="text-end font-semibold" data-quote-total>
          {money(q.total)}
        </dd>
      </dl>
      {q.discountNeedsApproval ? (
        <p
          role="note"
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3 text-sm"
        >
          {fill(t('quote.needsApproval'), {
            limit: String(Number(data.managerDiscountLimitPct)),
            who: q.discountSetByName ?? '—',
          })}
        </p>
      ) : q.discountApprovedByName ? (
        <p className="text-xs text-[var(--color-text-muted)]">
          {t('quote.discountApprovedBy')} {q.discountApprovedByName}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {can('approveDiscount') ? (
          <InlineForm
            action={act({ kind: 'approve-discount', quoteId: q.id })}
            locale={locale}
            submitLabel={t('quote.approveDiscount')}
            ariaLabel={t('quote.approveDiscount')}
          >
            {version}
          </InlineForm>
        ) : null}
        {can('issue') ? (
          <InlineForm
            action={act({ kind: 'issue', quoteId: q.id })}
            locale={locale}
            submitLabel={t('quote.issue')}
            ariaLabel={t('quote.issue')}
          >
            {version}
          </InlineForm>
        ) : null}
        {can('discard') ? (
          <InlineForm
            action={act({ kind: 'discard', quoteId: q.id })}
            locale={locale}
            submitLabel={t('quote.discard')}
            submitClassName={buttonSecondary}
            ariaLabel={t('quote.discard')}
          >
            {version}
          </InlineForm>
        ) : null}
      </div>
      {q.decidedAt ? (
        <p className="text-xs text-[var(--color-text-muted)]" data-quote-decision>
          {q.status === 'approved'
            ? `${q.authorizedByName} · ${t(`job.via.${q.authorizedVia}` as MessageKey)}`
            : q.declineReason}{' '}
          · {t('add.decidedBy')} {q.decidedByName} · {formatDateTime(locale, q.decidedAt, timeZone)}
        </p>
      ) : null}
      {can('decide') ? (
        <details open>
          <summary className="cursor-pointer text-sm font-semibold">{t('quote.decide')}</summary>
          <InlineForm
            action={act({ kind: 'decision', quoteId: q.id })}
            locale={locale}
            submitLabel={t('add.save')}
            className="mt-2 flex flex-col gap-3"
            ariaLabel={t('quote.decide')}
          >
            {version}
            <fieldset className="flex flex-wrap gap-4 text-sm">
              <legend className="sr-only">{t('quote.decide')}</legend>
              <label className="flex items-center gap-2">
                <input type="radio" name="decision" value="approve" defaultChecked /> {t('quote.approved')}
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="decision" value="decline" /> {t('quote.declined')}
              </label>
            </fieldset>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className={field}>
                {t('job.authorizedBy')}
                <input name="authorizedByName" defaultValue={job.customer.name} className={inputClass} />
              </label>
              <label className={field}>
                {t('job.authorizedVia')}
                <select name="authorizedVia" defaultValue="in_person" className={inputClass}>
                  {(['in_person', 'phone', 'written'] as const).map((v) => (
                    <option key={v} value={v}>
                      {t(`job.via.${v}`)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className={field}>
              {t('add.declineReason')}
              <input name="reason" maxLength={500} className={inputClass} />
            </label>
          </InlineForm>
        </details>
      ) : null}
    </div>
  );
}
