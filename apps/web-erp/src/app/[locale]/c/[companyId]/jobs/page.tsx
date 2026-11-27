import { unwrap, type JobListItem } from '@erp/api-client';
import { createTranslator, formatDateTime, isLocale, type Locale } from '@erp/localization';
import { OPEN_JOB_STATUSES } from '@erp/validation';
import { Wrench } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProblemNotice } from '@/components/ProblemNotice';
import { Badge, buttonPrimary, EmptyState, Ltr, PageHeader, Table, Tabs, td, th } from '@/components/ui';
import { MyClockBanner } from '@/components/workshop/Labour';
import { JobStatus } from '@/components/workshop/JobStatus';
import { attempt } from '@/lib/api';
import { loadCompany } from '@/lib/context';

/** Status colour cue on the board (the status name is always shown as text too). */
const STATUS_DOT: Record<string, string> = {
  draft: 'bg-[var(--color-text-muted)]',
  approved: 'bg-[var(--color-info)]',
  assigned: 'bg-[var(--color-info)]',
  in_progress: 'bg-[var(--color-primary)]',
  rework: 'bg-[var(--color-danger-brand)]',
  qc: 'bg-[var(--color-warning-brand)]',
  ready: 'bg-[var(--color-success-brand)]',
};

/** WEB-009 repair board (open jobs by status) and WEB-019 job card list. */
export default async function JobsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; companyId: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { locale, companyId } = await params;
  const list = (await searchParams).view === 'list';
  if (!isLocale(locale)) notFound();
  const t = createTranslator(locale);
  const ctx = await loadCompany(companyId);
  if (!ctx.ok) return null;
  const { api, can, company } = ctx.data;
  const jobs = await attempt(async () =>
    unwrap(
      await api.GET('/api/v1/companies/{companyId}/jobs', {
        params: { path: { companyId }, query: { view: list ? 'all' : 'open' } },
      }),
    ),
  );
  const myClock = can('workshop.job.work')
    ? await attempt(async () =>
        unwrap(
          await api.GET('/api/v1/companies/{companyId}/time-entries/current', {
            params: { path: { companyId } },
          }),
        ),
      )
    : null;
  const base = `/${locale}/c/${companyId}/jobs`;
  return (
    <>
      <PageHeader
        title={t('job.title')}
        actions={
          can('workshop.job.manage') ? (
            <Link className={buttonPrimary} href={`${base}/new`}>
              {t('job.new')}
            </Link>
          ) : null
        }
      >
        {t('job.notIncluded')}
      </PageHeader>
      {myClock?.ok && myClock.data.entry ? (
        <MyClockBanner
          entry={myClock.data.entry}
          locale={locale}
          companyId={companyId}
          timeZone={company.timezone}
        />
      ) : null}
      <Tabs
        label={t('job.title')}
        items={[
          { href: base, label: t('job.board'), current: !list },
          { href: `${base}?view=list`, label: t('job.list'), current: list },
        ]}
      />
      {!jobs.ok ? (
        <ProblemNotice result={jobs} locale={locale} />
      ) : list ? (
        <JobTable jobs={jobs.data} locale={locale} base={base} timeZone={company.timezone} />
      ) : jobs.data.length === 0 ? (
        <EmptyState
          icon={<Wrench aria-hidden size={18} />}
          action={
            can('workshop.job.manage') ? (
              <Link className={buttonPrimary} href={`${base}/new`}>
                {t('job.new')}
              </Link>
            ) : undefined
          }
        >
          {t('job.empty')}
        </EmptyState>
      ) : (
        <>
          {/* Statuses without jobs collapse into one row, so every job is in view. */}
          {OPEN_JOB_STATUSES.some((st) => !jobs.data.some((j) => j.status === st)) ? (
            <ul className="mb-3 flex flex-wrap gap-2" aria-label={t('job.emptyStatuses')}>
              {OPEN_JOB_STATUSES.filter((st) => !jobs.data.some((j) => j.status === st)).map((st) => (
                <li
                  key={st}
                  className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-xs text-[var(--color-text-muted)]"
                >
                  <span aria-hidden className={`size-1.5 rounded-full ${STATUS_DOT[st] ?? ''}`} />
                  {t(`job.status.${st}` as 'job.status.draft')}
                  <span className="tabular">0</span>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="scroll-quiet relative -mx-4 snap-x overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0">
            <div className="flex items-start gap-3" role="list" aria-label={t('job.board')}>
              {OPEN_JOB_STATUSES.filter((st) => jobs.data.some((j) => j.status === st)).map((st) => {
                const col = jobs.data.filter((j) => j.status === st);
                return (
                  <section
                    key={st}
                    role="listitem"
                    aria-labelledby={`col-${st}`}
                    className="flex w-[17rem] shrink-0 snap-start flex-col gap-2 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface-muted)]/60 p-2"
                  >
                    <h2
                      id={`col-${st}`}
                      className="flex items-center justify-between gap-2 px-1.5 pt-0.5 text-[13px] font-semibold"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          aria-hidden
                          className={`size-2 shrink-0 rounded-full ${STATUS_DOT[st] ?? ''}`}
                        />
                        <span className="truncate">{t(`job.status.${st}` as 'job.status.draft')}</span>
                      </span>
                      <span className="rounded-full bg-[var(--color-surface)] px-1.5 text-xs tabular text-[var(--color-text-muted)] ring-1 ring-[var(--color-border)]">
                        {col.length}
                      </span>
                    </h2>
                    {col.map((j) => (
                      <JobCardTile
                        key={j.id}
                        job={j}
                        locale={locale}
                        href={`${base}/${j.id}`}
                        timeZone={company.timezone}
                      />
                    ))}
                  </section>
                );
              })}
            </div>
          </div>
        </>
      )}
    </>
  );
}

function JobCardTile({
  job,
  locale,
  href,
  timeZone,
}: {
  job: JobListItem;
  locale: Locale;
  href: string;
  timeZone: string;
}) {
  const t = createTranslator(locale);
  return (
    <Link
      href={href}
      data-job={job.number}
      className="block rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm shadow-[var(--shadow-card)] transition-[border-color,box-shadow] hover:border-[var(--color-primary)]/60 hover:shadow-[var(--shadow-raised)]"
    >
      <div className="flex items-center justify-between gap-2">
        <Ltr className="font-semibold text-[var(--color-primary)]">{job.number}</Ltr>
        {job.overdue ? <Badge tone="danger">{t('job.overdue')}</Badge> : null}
      </div>
      <p className="mt-1 font-medium">
        <Ltr>{job.plate}</Ltr> · {job.vehicleName}
      </p>
      <p className="text-[var(--color-text-muted)]">{job.customerName}</p>
      <p className="mt-2 text-xs text-[var(--color-text-muted)]">
        {t('job.tasksProgress')
          .replace('{done}', String(job.tasksDone))
          .replace('{total}', String(job.tasksTotal))}
        {job.technicianNames.length ? ` · ${job.technicianNames.join(', ')}` : ''}
      </p>
      {job.promisedAt ? (
        <p className="text-xs text-[var(--color-text-muted)]">
          {t('job.promised')}: {formatDateTime(locale, job.promisedAt, timeZone)}
        </p>
      ) : null}
    </Link>
  );
}

function JobTable({
  jobs,
  locale,
  base,
  timeZone,
}: {
  jobs: JobListItem[];
  locale: Locale;
  base: string;
  timeZone: string;
}) {
  const t = createTranslator(locale);
  if (!jobs.length) return <EmptyState icon={<Wrench aria-hidden size={18} />}>{t('job.empty')}</EmptyState>;
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]">
      <Table caption={t('job.title')}>
        <thead>
          <tr>
            <th scope="col" className={th}>
              {t('job.number')}
            </th>
            <th scope="col" className={th}>
              {t('common.status')}
            </th>
            <th scope="col" className={th}>
              {t('job.vehicle')}
            </th>
            <th scope="col" className={th}>
              {t('job.customer')}
            </th>
            <th scope="col" className={th}>
              {t('job.technician')}
            </th>
            <th scope="col" className={th}>
              {t('ledger.date')}
            </th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((j) => (
            <tr key={j.id}>
              <th scope="row" className={`${td} text-start font-medium`}>
                <Link href={`${base}/${j.id}`} className="text-[var(--color-primary)] hover:underline">
                  <Ltr>{j.number}</Ltr>
                </Link>
              </th>
              <td className={td}>
                <JobStatus status={j.status} locale={locale} />
              </td>
              <td className={td}>
                <Ltr>{j.plate}</Ltr> · {j.vehicleName}
              </td>
              <td className={td}>{j.customerName}</td>
              <td className={td}>{j.technicianNames.join(', ') || '—'}</td>
              <td className={`${td} whitespace-nowrap`}>{formatDateTime(locale, j.createdAt, timeZone)}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
