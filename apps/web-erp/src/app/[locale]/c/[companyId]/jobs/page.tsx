import { unwrap, type JobListItem } from '@erp/api-client';
import { createTranslator, formatDateTime, isLocale, type Locale } from '@erp/localization';
import { OPEN_JOB_STATUSES } from '@erp/validation';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProblemNotice } from '@/components/ProblemNotice';
import {
  Badge,
  buttonGhost,
  buttonPrimary,
  EmptyState,
  Ltr,
  PageHeader,
  Table,
  td,
  th,
} from '@/components/ui';
import { MyClockBanner } from '@/components/workshop/Labour';
import { JobStatus } from '@/components/workshop/JobStatus';
import { attempt } from '@/lib/api';
import { loadCompany } from '@/lib/context';

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
  const tab = (active: boolean) =>
    `${buttonGhost} ${active ? 'bg-[var(--color-surface-muted)] text-[var(--color-primary)]' : ''}`;
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
      <nav aria-label={t('job.title')} className="mb-4 flex gap-2">
        <Link href={base} aria-current={!list ? 'page' : undefined} className={tab(!list)}>
          {t('job.board')}
        </Link>
        <Link href={`${base}?view=list`} aria-current={list ? 'page' : undefined} className={tab(list)}>
          {t('job.list')}
        </Link>
      </nav>
      {!jobs.ok ? (
        <ProblemNotice result={jobs} locale={locale} />
      ) : list ? (
        <JobTable jobs={jobs.data} locale={locale} base={base} timeZone={company.timezone} />
      ) : jobs.data.length === 0 ? (
        <EmptyState>{t('job.empty')}</EmptyState>
      ) : (
        <div className="relative -mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
          <div className="flex gap-3" role="list" aria-label={t('job.board')}>
            {OPEN_JOB_STATUSES.map((s) => {
              const col = jobs.data.filter((j) => j.status === s);
              return (
                <section
                  key={s}
                  role="listitem"
                  aria-labelledby={`col-${s}`}
                  className={`flex shrink-0 flex-col gap-2 rounded-xl bg-[var(--color-surface-muted)] p-2 ${col.length ? 'w-64' : 'w-28'}`}
                >
                  <h2
                    id={`col-${s}`}
                    className="flex items-center justify-between px-1 text-sm font-semibold"
                  >
                    {t(`job.status.${s}` as 'job.status.draft')}
                    <span className="text-xs text-[var(--color-text-muted)]">{col.length}</span>
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
      className="block rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm shadow-[var(--shadow-card)] hover:border-[var(--color-primary)]"
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
  if (!jobs.length) return <EmptyState>{t('job.empty')}</EmptyState>;
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
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
