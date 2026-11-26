import { unwrap, type JobCard } from '@erp/api-client';
import { createTranslator, formatDateTime, isLocale, type Locale, type MessageKey } from '@erp/localization';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
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
} from '@/components/ui';
import { InspectionCard, PhotosCard } from '@/components/workshop/CheckIn';
import { InlineForm } from '@/components/workshop/InlineForm';
import { JobForm } from '@/components/workshop/JobForm';
import { JobStatus } from '@/components/workshop/JobStatus';
import { LabourCard, ManualTimeForm, TaskClock } from '@/components/workshop/Labour';
import { attempt } from '@/lib/api';
import { loadCompany } from '@/lib/context';
import { isoToZonedLocal } from '@/lib/time';
import {
  jobStepAction,
  recordInspectionAction,
  removePhotoAction,
  updateJobDraftAction,
  uploadPhotosAction,
} from '../../workshop-actions';

const UUID = /^[0-9a-f-]{36}$/i;
const buttonDanger =
  'inline-flex min-h-10 items-center justify-center rounded-lg border border-[var(--color-danger-brand)] px-4 text-sm font-semibold text-[var(--color-danger)]';

/** WEB-020 job card details with WEB-021 assignment, WEB-028 final inspection and WEB-029 delivery. */
export default async function JobPage({
  params,
}: {
  params: Promise<{ locale: string; companyId: string; jobId: string }>;
}) {
  const { locale, companyId, jobId } = await params;
  if (!isLocale(locale) || !UUID.test(jobId)) notFound();
  const t = createTranslator(locale);
  const ctx = await loadCompany(companyId);
  if (!ctx.ok) return null;
  const { api, company, me } = ctx.data;
  const path = { params: { path: { companyId, jobId } } };
  const res = await attempt(async () =>
    unwrap(await api.GET('/api/v1/companies/{companyId}/jobs/{jobId}', path)),
  );
  if (!res.ok) {
    if (res.status === 404) notFound();
    return <ProblemNotice result={res} locale={locale} />;
  }
  const j = res.data;
  const can = (a: string) => j.actions.includes(a);
  const techs =
    can('assign') || j.canRecordTime
      ? await attempt(async () =>
          unwrap(await api.GET('/api/v1/companies/{companyId}/jobs/{jobId}/technicians', path)),
        )
      : null;
  const tz = company.timezone;
  // Managers never enter their own time (the server refuses it too), so they are not offered.
  const otherTechs = techs?.ok ? techs.data.filter((x) => x.id !== me.user.id) : [];
  const step = (
    op: Parameters<typeof jobStepAction>[3],
    extra: { taskId?: string; timeZone?: string } = {},
  ) => jobStepAction.bind(null, locale, companyId, j.id, op, extra);
  const version = <input type="hidden" name="version" value={j.version} />;
  const base = `/${locale}/c/${companyId}`;
  const when = (iso: string | null | undefined) => (iso ? formatDateTime(locale, iso, tz) : '—');

  return (
    <>
      <PageHeader title={j.number}>
        <span className="inline-flex flex-wrap items-center gap-2">
          <JobStatus status={j.status} locale={locale} />
          {j.overdue ? <Badge tone="danger">{t('job.overdue')}</Badge> : null}
          <Link href={`${base}/vehicles/${j.vehicle.id}`} className="font-medium hover:underline">
            <Ltr>{j.vehicle.plate}</Ltr> · {j.vehicle.make} {j.vehicle.model}
          </Link>
          ·
          <Link href={`${base}/customers/${j.customer.id}`} className="hover:underline">
            {locale === 'ar' && j.customer.nameAr ? j.customer.nameAr : j.customer.name}
          </Link>
          <Ltr>{j.customer.phone}</Ltr> · {j.branchCode}
        </span>
      </PageHeader>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title={t('job.complaint')} id="details">
            <p className="whitespace-pre-line">{j.complaint}</p>
            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
              <Fact label={t('job.odometerIn')}>
                <Ltr>{j.odometerIn.toLocaleString('en')}</Ltr>
              </Fact>
              <Fact label={t('job.fuelLevel')}>{t(`job.fuel.${j.fuelLevel}` as MessageKey)}</Fact>
              <Fact label={t('job.promised')}>{when(j.promisedAt)}</Fact>
              {j.authorizedAt ? (
                <Fact label={t('job.authorization')}>
                  {j.authorizedByName} · {t(`job.via.${j.authorizedVia}` as MessageKey)} ·{' '}
                  {when(j.authorizedAt)}
                </Fact>
              ) : null}
              {j.reworkCount ? <Fact label={t('job.reworkCount')}>{j.reworkCount}</Fact> : null}
              {j.deliveredAt ? (
                <Fact label={t('job.deliveredTo')}>
                  {j.deliveredToName} · {when(j.deliveredAt)} ·{' '}
                  <Ltr>{j.odometerOut?.toLocaleString('en')} km</Ltr>
                </Fact>
              ) : null}
              {j.cancelledReason ? <Fact label={t('job.cancelReason')}>{j.cancelledReason}</Fact> : null}
            </dl>
          </Card>

          <InspectionCard
            job={j}
            locale={locale}
            timeZone={tz}
            action={can('inspect') ? recordInspectionAction.bind(null, locale, companyId, j.id) : undefined}
          />
          <PhotosCard
            job={j}
            locale={locale}
            timeZone={tz}
            photoHref={(photoId, thumb) =>
              `${base}/jobs/${j.id}/photos/${photoId}${thumb ? '?size=thumb' : ''}`
            }
            upload={can('addPhoto') ? uploadPhotosAction.bind(null, locale, companyId, j.id) : undefined}
            remove={
              can('removePhoto')
                ? (photoId) => removePhotoAction.bind(null, locale, companyId, j.id, photoId)
                : undefined
            }
          />
          <Card title={t('job.tasks')} id="tasks" flush>
            <Table caption={t('job.tasks')}>
              <thead>
                <tr>
                  <th scope="col" className={th}>
                    {t('job.task')}
                  </th>
                  <th scope="col" className={thNum}>
                    {t('job.hours')}
                  </th>
                  <th scope="col" className={th}>
                    {t('job.technician')}
                  </th>
                  <th scope="col" className={thNum}>
                    {t('labour.actual')}
                  </th>
                  <th scope="col" className={th}>
                    {t('common.status')}
                  </th>
                  <th scope="col" className={th}>
                    {t('labour.time')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {j.tasks.map((task) => (
                  <tr key={task.id} data-task={task.lineNo}>
                    <th scope="row" className={`${td} text-start font-normal`}>
                      {task.lineNo}. {task.description}
                    </th>
                    <td className={tdNum}>
                      <Ltr>{task.estimatedHours}</Ltr>
                    </td>
                    <td className={td}>
                      {can('assign') && task.status === 'open' && techs?.ok ? (
                        <InlineForm
                          action={step('assign', { taskId: task.id })}
                          locale={locale}
                          submitLabel={t('job.assign')}
                          submitClassName={buttonSecondary}
                          ariaLabel={`${t('job.assign')} ${task.lineNo}`}
                        >
                          {version}
                          <label className="sr-only" htmlFor={`tech-${task.id}`}>
                            {t('job.technician')} {task.lineNo}
                          </label>
                          <select
                            id={`tech-${task.id}`}
                            name="technicianId"
                            defaultValue={task.technicianId ?? ''}
                            className={`${inputClass} w-44`}
                          >
                            <option value="">{t('job.unassigned')}</option>
                            {techs.data.map((x) => (
                              <option key={x.id} value={x.id}>
                                {x.displayName}
                              </option>
                            ))}
                          </select>
                        </InlineForm>
                      ) : (
                        (task.technicianName ?? (
                          <span className="text-[var(--color-text-muted)]">{t('job.unassigned')}</span>
                        ))
                      )}
                    </td>
                    <td className={tdNum}>
                      <Ltr>{task.actualHours}</Ltr>
                    </td>
                    <td className={td}>
                      {task.status === 'done' ? (
                        <Badge tone="success">{t('job.done')}</Badge>
                      ) : task.canComplete ? (
                        <InlineForm
                          action={step('complete', { taskId: task.id })}
                          locale={locale}
                          submitLabel={t('job.complete')}
                          submitClassName={buttonSecondary}
                          ariaLabel={`${t('job.complete')} ${task.lineNo}`}
                        >
                          {version}
                        </InlineForm>
                      ) : (
                        <Badge>{t('job.openTask')}</Badge>
                      )}
                    </td>
                    <td className={td}>
                      <TaskClock job={j} task={task} locale={locale} companyId={companyId} timeZone={tz} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" className={`${td} text-start font-semibold`}>
                    {t('job.estimate')}
                  </th>
                  <td className={`${tdNum} font-semibold`}>
                    <Ltr>{j.estimatedHours}</Ltr>
                  </td>
                  <td className={td} />
                  <td className={`${tdNum} font-semibold`}>
                    <Ltr>{j.actualHours}</Ltr>
                  </td>
                  <td className={td} colSpan={2} />
                </tr>
              </tfoot>
            </Table>
          </Card>

          <LabourCard job={j} locale={locale} companyId={companyId} timeZone={tz} />

          <Card title={t('job.timeline')} id="timeline">
            <ol className="flex flex-col gap-3 border-s border-[var(--color-border)] ps-4">
              {j.events.map((e) => (
                <li key={e.id} className="relative">
                  <span
                    aria-hidden
                    className="absolute -start-[21px] top-1.5 size-2.5 rounded-full bg-[var(--color-primary)]"
                  />
                  <p className="text-sm">
                    <span className="font-medium">
                      {e.toStatus && e.kind === 'status'
                        ? `${t('job.event.status')}: ${t(`job.status.${e.toStatus}` as MessageKey)}`
                        : t(`job.event.${e.kind}` as MessageKey)}
                    </span>
                    {e.toStatus && e.kind !== 'status' && e.kind !== 'created'
                      ? ` → ${t(`job.status.${e.toStatus}` as MessageKey)}`
                      : ''}
                    {e.note ? <span className="text-[var(--color-text-muted)]"> — {e.note}</span> : null}
                  </p>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {e.actorName} · {when(e.occurredAt)}
                  </p>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <aside className="flex flex-col" aria-label={t('common.actions')}>
          {can('authorize') ? (
            <Panel title={t('job.authorize')} help={t('job.authorizeHelp')}>
              <InlineForm
                action={step('authorize')}
                locale={locale}
                submitLabel={t('job.authorize')}
                className="flex flex-col gap-3"
              >
                {version}
                <LabeledInput
                  id="auth-name"
                  name="authorizedByName"
                  label={t('job.authorizedBy')}
                  defaultValue={j.customer.name}
                />
                <label className="flex flex-col gap-1.5 text-[13px] font-medium" htmlFor="auth-via">
                  {t('job.authorizedVia')}
                  <select id="auth-via" name="authorizedVia" className={inputClass} defaultValue="in_person">
                    {(['in_person', 'phone', 'written'] as const).map((v) => (
                      <option key={v} value={v}>
                        {t(`job.via.${v}`)}
                      </option>
                    ))}
                  </select>
                </label>
              </InlineForm>
            </Panel>
          ) : null}
          {can('start') ? (
            <Panel title={t('job.start')}>
              <InlineForm action={step('start')} locale={locale} submitLabel={t('job.start')}>
                {version}
              </InlineForm>
            </Panel>
          ) : null}
          {can('submitQc') ? (
            <Panel title={t('job.submitQc')}>
              <InlineForm action={step('submit-qc')} locale={locale} submitLabel={t('job.submitQc')}>
                {version}
              </InlineForm>
            </Panel>
          ) : null}
          {j.status === 'qc' && !can('qc') ? (
            <p
              role="note"
              className="mb-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4 text-sm"
            >
              {t('job.waitingQc')}
            </p>
          ) : null}
          {can('qc') ? (
            <Panel title={t('job.qc')} help={t('job.qcHelp')}>
              <InlineForm
                action={step('qc')}
                locale={locale}
                submitLabel={t('job.qc')}
                className="flex flex-col gap-3"
              >
                {version}
                <fieldset className="flex gap-4 text-sm">
                  <legend className="sr-only">{t('job.qc')}</legend>
                  <label className="flex items-center gap-2">
                    <input type="radio" name="result" value="pass" defaultChecked /> {t('job.qcPass')}
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="radio" name="result" value="fail" /> {t('job.qcFail')}
                  </label>
                </fieldset>
                <LabeledInput id="qc-note" name="note" label={t('job.qcNote')} />
                <fieldset className="text-sm">
                  <legend className="mb-1 font-medium">{t('job.qcReopen')}</legend>
                  {j.tasks.map((task) => (
                    <label key={task.id} className="flex items-center gap-2">
                      <input type="checkbox" name="reopenTaskIds" value={task.id} /> {task.lineNo}.{' '}
                      {task.description}
                    </label>
                  ))}
                </fieldset>
              </InlineForm>
            </Panel>
          ) : null}
          {can('deliver') ? (
            <Panel title={t('job.deliver')}>
              <InlineForm
                action={step('deliver')}
                locale={locale}
                submitLabel={t('job.deliver')}
                className="flex flex-col gap-3"
              >
                {version}
                <LabeledInput
                  id="del-name"
                  name="deliveredToName"
                  label={t('job.deliveredTo')}
                  defaultValue={j.customer.name}
                />
                <LabeledInput
                  id="del-odo"
                  name="odometerOut"
                  label={t('job.odometerOut')}
                  type="number"
                  defaultValue={String(j.odometerIn)}
                />
              </InlineForm>
            </Panel>
          ) : null}
          {can('promise') ? (
            <Panel title={t('job.promise')}>
              <InlineForm
                action={step('promise', { timeZone: tz })}
                locale={locale}
                submitLabel={t('cust.save')}
                submitClassName={buttonSecondary}
                className="flex flex-col gap-3"
              >
                {version}
                <LabeledInput
                  id="promise-at"
                  name="promisedAt"
                  label={t('job.promisedAt')}
                  type="datetime-local"
                  defaultValue={isoToZonedLocal(j.promisedAt, tz)}
                />
              </InlineForm>
            </Panel>
          ) : null}
          {j.canRecordTime && otherTechs.length ? (
            <Panel title={t('labour.manual')} help={t('labour.manualHelp')}>
              <ManualTimeForm
                job={j}
                technicians={otherTechs}
                locale={locale}
                companyId={companyId}
                timeZone={tz}
              />
            </Panel>
          ) : null}
          {can('note') ? (
            <Panel title={t('job.note')}>
              <InlineForm
                action={step('notes')}
                locale={locale}
                submitLabel={t('job.note')}
                submitClassName={buttonSecondary}
                className="flex flex-col gap-3"
              >
                <label className="flex flex-col gap-1.5 text-[13px] font-medium" htmlFor="note-text">
                  {t('job.noteText')}
                  <textarea id="note-text" name="note" rows={2} maxLength={2000} className={inputClass} />
                </label>
              </InlineForm>
            </Panel>
          ) : null}
          {can('cancel') ? (
            <Panel title={t('job.cancel')}>
              <InlineForm
                action={step('cancel')}
                locale={locale}
                submitLabel={t('job.cancel')}
                submitClassName={buttonDanger}
                className="flex flex-col gap-3"
              >
                {version}
                <LabeledInput id="cancel-reason" name="reason" label={t('job.cancelReason')} />
              </InlineForm>
            </Panel>
          ) : null}
          {can('edit') ? (
            <EditDraft
              job={j}
              locale={locale}
              action={updateJobDraftAction.bind(null, locale, companyId, j.id, tz)}
              timeZone={tz}
            />
          ) : null}
        </aside>
      </div>
    </>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-[var(--color-text-muted)]">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

function Panel({ title, help, children }: { title: string; help?: string; children: ReactNode }) {
  return (
    <section className="mb-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-card)]">
      <h2 className="mb-2 text-sm font-semibold">{title}</h2>
      {help ? <p className="mb-3 text-xs text-[var(--color-text-muted)]">{help}</p> : null}
      {children}
    </section>
  );
}

function LabeledInput({
  id,
  name,
  label,
  type = 'text',
  defaultValue,
}: {
  id: string;
  name: string;
  label: string;
  type?: string;
  defaultValue?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-[13px] font-medium" htmlFor={id}>
      {label}
      <input
        id={id}
        name={name}
        type={type}
        defaultValue={defaultValue}
        dir={type === 'text' ? undefined : 'ltr'}
        className={inputClass}
      />
    </label>
  );
}

function EditDraft({
  job,
  locale,
  action,
  timeZone,
}: {
  job: JobCard;
  locale: Locale;
  action: Parameters<typeof JobForm>[0]['action'];
  timeZone: string;
}) {
  const t = createTranslator(locale);
  return (
    <details className="mb-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <summary className="cursor-pointer text-sm font-semibold">{t('job.editDraft')}</summary>
      <div className="mt-4">
        <JobForm
          locale={locale}
          mode="edit"
          action={action}
          defaults={{
            complaint: job.complaint,
            odometerIn: String(job.odometerIn),
            fuelLevel: job.fuelLevel,
            promisedLocal: isoToZonedLocal(job.promisedAt, timeZone),
            tasks: job.tasks.map((x) => ({ description: x.description, hours: x.estimatedHours })),
            version: job.version,
          }}
        />
      </div>
    </details>
  );
}
