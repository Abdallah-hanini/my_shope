import type { JobCard } from '@erp/api-client';
import { createTranslator, formatDateTime, type Locale, type MessageKey } from '@erp/localization';
import {
  decideAdditionAction,
  proposeAdditionAction,
  withdrawAdditionAction,
} from '@/app/[locale]/c/[companyId]/workshop-actions';
import { fill } from '@/lib/notifications';
import { Badge, buttonSecondary, Card, inputClass, Ltr, fieldLabel } from '../ui';
import { InlineForm } from './InlineForm';

const tone = { proposed: 'warning', approved: 'success', declined: 'danger', withdrawn: 'neutral' } as const;

/** WEB-025 additional work on a job: the proposals with the customer's decision, and the forms. */
export function AdditionsCard({
  job,
  locale,
  companyId,
  timeZone,
}: {
  job: JobCard;
  locale: Locale;
  companyId: string;
  timeZone: string;
}) {
  const t = createTranslator(locale);
  const canPropose = job.actions.includes('proposeAddition');
  if (!job.additions.length && !canPropose) return null;
  const version = <input type="hidden" name="version" value={job.version} />;
  return (
    <Card title={t('add.title')} id="additions">
      <div className="flex flex-col gap-5">
        {job.additions.map((a) => (
          <article
            key={a.id}
            data-addition={a.seq}
            className="rounded-[var(--radius-control)] border border-[var(--color-border)] p-4"
            aria-labelledby={`addition-${a.seq}`}
          >
            <header className="mb-2 flex flex-wrap items-center gap-2">
              <h3 id={`addition-${a.seq}`} className="text-sm font-semibold">
                {fill(t('add.number'), { seq: String(a.seq) })}
              </h3>
              <Badge tone={tone[a.status as keyof typeof tone] ?? 'neutral'}>
                {t(`add.status.${a.status}` as MessageKey)}
              </Badge>
              <span className="text-xs text-[var(--color-text-muted)]">
                {t('add.proposedBy')} {a.proposedByName} · {formatDateTime(locale, a.proposedAt, timeZone)}
              </span>
            </header>
            <p className="mb-2 whitespace-pre-line text-sm">{a.finding}</p>
            <ul className="mb-2 list-disc ps-5 text-sm">
              {a.tasks.map((x) => (
                <li key={x.lineNo}>
                  {x.description} · <Ltr>{x.estimatedHours} h</Ltr>
                </li>
              ))}
            </ul>
            {a.decidedAt ? (
              <p className="text-xs text-[var(--color-text-muted)]">
                {a.status === 'approved'
                  ? `${a.authorizedByName} · ${t(`job.via.${a.authorizedVia}` as MessageKey)}`
                  : a.closeReason}{' '}
                · {t('add.decidedBy')} {a.decidedByName} · {formatDateTime(locale, a.decidedAt, timeZone)}
              </p>
            ) : null}
            {a.canDecide ? (
              <details className="mt-3" open>
                <summary className="cursor-pointer text-sm font-semibold">{t('add.decide')}</summary>
                <InlineForm
                  action={decideAdditionAction.bind(null, locale, companyId, job.id, a.id)}
                  locale={locale}
                  submitLabel={t('add.save')}
                  className="mt-2 flex flex-col gap-3"
                  ariaLabel={`${t('add.decide')} ${a.seq}`}
                >
                  {version}
                  <fieldset className="flex flex-wrap gap-4 text-sm">
                    <legend className="sr-only">{t('add.decide')}</legend>
                    <label className="flex items-center gap-2">
                      <input type="radio" name="decision" value="approve" defaultChecked /> {t('add.approve')}
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="radio" name="decision" value="decline" /> {t('add.decline')}
                    </label>
                  </fieldset>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className={fieldLabel}>
                      {t('job.authorizedBy')}
                      <input
                        name="authorizedByName"
                        defaultValue={job.customer.name}
                        className={inputClass}
                      />
                    </label>
                    <label className={fieldLabel}>
                      {t('job.authorizedVia')}
                      <select name="authorizedVia" className={inputClass} defaultValue="phone">
                        {(['in_person', 'phone', 'written'] as const).map((v) => (
                          <option key={v} value={v}>
                            {t(`job.via.${v}`)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label className={fieldLabel}>
                    {t('add.declineReason')}
                    <input name="reason" maxLength={500} className={inputClass} />
                  </label>
                </InlineForm>
              </details>
            ) : null}
            {a.canWithdraw ? (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-medium">{t('add.withdraw')}</summary>
                <InlineForm
                  action={withdrawAdditionAction.bind(null, locale, companyId, job.id, a.id)}
                  locale={locale}
                  submitLabel={t('add.withdraw')}
                  submitClassName={buttonSecondary}
                  ariaLabel={`${t('add.withdraw')} ${a.seq}`}
                >
                  {version}
                  <label className={fieldLabel}>
                    {t('add.withdrawReason')}
                    <input name="reason" maxLength={500} className={`${inputClass} w-64`} />
                  </label>
                </InlineForm>
              </details>
            ) : null}
          </article>
        ))}
        {canPropose ? (
          <details>
            <summary className="cursor-pointer text-sm font-semibold">{t('add.propose')}</summary>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">{t('add.proposeHelp')}</p>
            <InlineForm
              action={proposeAdditionAction.bind(null, locale, companyId, job.id)}
              locale={locale}
              submitLabel={t('add.propose')}
              submitClassName={buttonSecondary}
              className="mt-3 flex flex-col gap-3"
              ariaLabel={t('add.propose')}
            >
              {version}
              <label className={fieldLabel}>
                {t('add.finding')}
                <textarea name="finding" rows={2} maxLength={2000} className={inputClass} />
              </label>
              {[1, 2, 3].map((n) => (
                <div key={n} className="grid grid-cols-[1fr_7rem] gap-2">
                  <label className={fieldLabel}>
                    {t('job.task')} {n}
                    <input name="taskDescription" maxLength={500} className={inputClass} />
                  </label>
                  <label className={fieldLabel}>
                    {t('job.hours')} {n}
                    <input name="taskHours" inputMode="decimal" dir="ltr" className={inputClass} />
                  </label>
                </div>
              ))}
            </InlineForm>
          </details>
        ) : null}
      </div>
    </Card>
  );
}
