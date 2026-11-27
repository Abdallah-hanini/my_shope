import type { CurrentClock, JobCard, Technician } from '@erp/api-client';
import Link from 'next/link';
import { createTranslator, formatDateTime, type Locale } from '@erp/localization';
import { clockAction, manualTimeAction, voidTimeAction } from '@/app/[locale]/c/[companyId]/labour-actions';
import {
  Badge,
  buttonPrimary,
  buttonSecondary,
  Card,
  inputClass,
  Ltr,
  Table,
  td,
  tdNum,
  th,
  thNum,
  fieldLabel,
} from '../ui';
import { InlineForm } from './InlineForm';

type Task = JobCard['tasks'][number];

/** Labour time on a job (WEB-023): clock buttons per task, the entries, and manager corrections. */
export function TaskClock({
  job,
  task,
  locale,
  companyId,
  timeZone,
}: {
  job: JobCard;
  task: Task;
  locale: Locale;
  companyId: string;
  timeZone: string;
}) {
  const t = createTranslator(locale);
  const back = `/${locale}/c/${companyId}/jobs/${job.id}`;
  return (
    <div className="flex flex-col items-start gap-1.5">
      {task.clockedOn.map((c) => (
        <Badge key={c.entryId} tone="info">
          <span aria-hidden className="me-1 inline-block size-2 rounded-full bg-current" />
          {c.technicianName} · {t('labour.since')} <Ltr>{clock(locale, c.since, timeZone)}</Ltr>
        </Badge>
      ))}
      {task.myOpenEntryId ? (
        <InlineForm
          action={clockAction.bind(null, locale, companyId, { op: 'off', entryId: task.myOpenEntryId }, back)}
          locale={locale}
          submitLabel={t('labour.clockOff')}
          submitClassName={buttonPrimary}
          ariaLabel={`${t('labour.clockOff')} ${task.lineNo}`}
        />
      ) : task.canClockOn ? (
        <InlineForm
          action={clockAction.bind(
            null,
            locale,
            companyId,
            { op: 'on', jobId: job.id, taskId: task.id },
            back,
          )}
          locale={locale}
          submitLabel={t('labour.clockOn')}
          submitClassName={buttonSecondary}
          ariaLabel={`${t('labour.clockOn')} ${task.lineNo}`}
        />
      ) : null}
    </div>
  );
}

export function LabourCard({
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
  const back = `/${locale}/c/${companyId}/jobs/${job.id}`;
  if (!job.timeEntries.length)
    return (
      <Card title={t('labour.entries')} id="labour">
        <p className="text-sm text-[var(--color-text-muted)]">{t('labour.noEntries')}</p>
      </Card>
    );
  return (
    <Card title={`${t('labour.entries')} · ${job.actualHours} h`} id="labour" flush>
      <Table caption={t('labour.entries')}>
        <thead>
          <tr>
            <th scope="col" className={th}>
              {t('labour.task')}
            </th>
            <th scope="col" className={th}>
              {t('labour.technician')}
            </th>
            <th scope="col" className={th}>
              {t('labour.start')}
            </th>
            <th scope="col" className={th}>
              {t('labour.end')}
            </th>
            <th scope="col" className={thNum}>
              {t('labour.minutes')}
            </th>
            <th scope="col" className={th}>
              {t('labour.source')}
            </th>
          </tr>
        </thead>
        <tbody>
          {job.timeEntries.map((e) => (
            <tr key={e.id} data-entry={e.id} className={e.voided ? 'text-[var(--color-text-muted)]' : ''}>
              <td className={td}>{e.taskLineNo}</td>
              <td className={td}>{e.technicianName}</td>
              <td className={td}>
                <Ltr>{formatDateTime(locale, e.startedAt, timeZone)}</Ltr>
              </td>
              <td className={td}>
                {e.endedAt ? (
                  <Ltr>{formatDateTime(locale, e.endedAt, timeZone)}</Ltr>
                ) : (
                  <Badge tone="info">{t('labour.running')}</Badge>
                )}
              </td>
              <td className={tdNum}>
                <Ltr className={e.voided ? 'line-through' : ''}>{e.minutes}</Ltr>
              </td>
              <td className={td}>
                <div className="flex flex-col items-start gap-1.5">
                  <span className="text-sm">
                    {e.source === 'manual'
                      ? `${t('labour.source.manual')} ${e.createdByName} — ${e.reason ?? ''}`
                      : t('labour.source.clock')}
                  </span>
                  {e.voided ? (
                    <span className="text-xs">
                      <Badge tone="danger">{t('labour.voided')}</Badge> {e.voidedByName} — {e.voidReason}
                    </span>
                  ) : null}
                  {e.canStop ? (
                    <InlineForm
                      action={clockAction.bind(null, locale, companyId, { op: 'off', entryId: e.id }, back)}
                      locale={locale}
                      submitLabel={t('labour.clockOff')}
                      submitClassName={buttonSecondary}
                    />
                  ) : null}
                  {e.canVoid ? (
                    <details>
                      <summary className="cursor-pointer text-xs font-medium">{t('labour.void')}</summary>
                      <InlineForm
                        action={voidTimeAction.bind(null, locale, companyId, job.id, e.id)}
                        locale={locale}
                        submitLabel={t('labour.void')}
                        submitClassName={buttonSecondary}
                        ariaLabel={`${t('labour.void')} ${e.technicianName} ${e.minutes}`}
                      >
                        <label className="flex flex-col gap-1 text-xs font-medium">
                          {t('labour.voidReason')}
                          <input name="reason" className={`${inputClass} w-52`} maxLength={500} />
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
    </Card>
  );
}

export function ManualTimeForm({
  job,
  technicians,
  locale,
  companyId,
  timeZone,
}: {
  job: JobCard;
  technicians: Technician[];
  locale: Locale;
  companyId: string;
  timeZone: string;
}) {
  const t = createTranslator(locale);
  return (
    <InlineForm
      action={manualTimeAction.bind(null, locale, companyId, job.id, timeZone)}
      locale={locale}
      submitLabel={t('labour.manual')}
      submitClassName={buttonSecondary}
      className="flex flex-col gap-3"
      ariaLabel={t('labour.manual')}
    >
      <label className={fieldLabel}>
        {t('labour.task')}
        <select name="taskId" className={inputClass}>
          {job.tasks.map((x) => (
            <option key={x.id} value={x.id}>
              {x.lineNo}. {x.description}
            </option>
          ))}
        </select>
      </label>
      <label className={fieldLabel}>
        {t('labour.technician')}
        <select name="technicianId" className={inputClass} defaultValue={job.tasks[0]?.technicianId ?? ''}>
          {technicians.map((x) => (
            <option key={x.id} value={x.id}>
              {x.displayName}
            </option>
          ))}
        </select>
      </label>
      <label className={fieldLabel}>
        {t('labour.start')}
        <input name="startedAt" type="datetime-local" dir="ltr" className={inputClass} />
      </label>
      <label className={fieldLabel}>
        {t('labour.end')}
        <input name="endedAt" type="datetime-local" dir="ltr" className={inputClass} />
      </label>
      <label className={fieldLabel}>
        {t('labour.reason')}
        <input name="reason" className={inputClass} maxLength={500} />
      </label>
    </InlineForm>
  );
}

const clock = (locale: Locale, iso: string, timeZone: string) =>
  new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en-GB', { timeStyle: 'short', timeZone }).format(
    new Date(iso),
  );

/** "You are clocked on to …" with a clock-off button, for technicians on the board. */
export function MyClockBanner({
  entry,
  locale,
  companyId,
  timeZone,
}: {
  entry: NonNullable<CurrentClock['entry']>;
  locale: Locale;
  companyId: string;
  timeZone: string;
}) {
  const t = createTranslator(locale);
  const base = `/${locale}/c/${companyId}`;
  return (
    <section
      role="status"
      aria-label={t('labour.working')}
      className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-[var(--color-info-brand,var(--color-border))] bg-[var(--color-surface-muted)] p-4 text-sm"
    >
      <p>
        <span aria-hidden className="me-2 inline-block size-2.5 rounded-full bg-[var(--color-primary)]" />
        {t('labour.youAreOn')}{' '}
        <Link href={`${base}/jobs/${entry.jobId}`} className="font-semibold hover:underline">
          {entry.jobNumber}
        </Link>{' '}
        · <Ltr>{entry.plate}</Ltr> · {entry.taskLineNo}. {entry.taskDescription} · {t('labour.since')}{' '}
        <Ltr>{clock(locale, entry.since, timeZone)}</Ltr>
      </p>
      <InlineForm
        action={clockAction.bind(
          null,
          locale,
          companyId,
          { op: 'off', entryId: entry.entryId },
          `${base}/jobs`,
        )}
        locale={locale}
        submitLabel={t('labour.clockOff')}
        submitClassName={buttonPrimary}
      />
    </section>
  );
}
