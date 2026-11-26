import { unwrap, type Appointment } from '@erp/api-client';
import { createTranslator, isLocale, type MessageKey } from '@erp/localization';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProblemNotice } from '@/components/ProblemNotice';
import {
  Badge,
  buttonGhost,
  buttonPrimary,
  buttonSecondary,
  Card,
  inputClass,
  Ltr,
  Notice,
  PageHeader,
  Table,
  td,
  th,
} from '@/components/ui';
import { attempt } from '@/lib/api';
import { loadCompany, localName } from '@/lib/context';
import { addDays, DATE } from '@/lib/dates';
import { todayIn } from '@/lib/ledger';

const UUID = /^[0-9a-f-]{36}$/i;
const TONE = { booked: 'info', checked_in: 'success', cancelled: 'neutral', no_show: 'warning' } as const;

/** WEB-010 appointment calendar: one day of a branch, slot by slot. */
export default async function AppointmentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; companyId: string }>;
  searchParams: Promise<{ branch?: string; date?: string }>;
}) {
  const { locale, companyId } = await params;
  const sp = await searchParams;
  if (!isLocale(locale)) notFound();
  const t = createTranslator(locale);
  const ctx = await loadCompany(companyId);
  if (!ctx.ok) return null;
  const { api, can, company, me } = ctx.data;
  const branches = await attempt(async () =>
    unwrap(await api.GET('/api/v1/companies/{companyId}/branches', { params: { path: { companyId } } })),
  );
  // Branches in the caller's scope (the API checks again).
  const mine = me.companies.find((c) => c.companyId === companyId)?.assignments ?? [];
  const wide = mine.some((a) => a.branchId === null);
  const list = branches.ok
    ? branches.data.filter((b) => b.status === 'active' && (wide || mine.some((a) => a.branchId === b.id)))
    : [];
  const branchId =
    sp.branch && UUID.test(sp.branch) && list.some((b) => b.id === sp.branch) ? sp.branch : list[0]?.id;
  const today = todayIn(company.timezone);
  const date = sp.date && DATE.test(sp.date) ? sp.date : today;
  const base = `/${locale}/c/${companyId}/appointments`;
  const href = (d: string) => `${base}?branch=${branchId}&date=${d}`;
  if (!branchId) return <ProblemNotice result={{ status: 403 }} locale={locale} />;
  const day = await attempt(async () =>
    unwrap(
      await api.GET('/api/v1/companies/{companyId}/appointments', {
        params: { path: { companyId }, query: { branchId, date } },
      }),
    ),
  );
  const timeOf = (iso: string) =>
    new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en-GB', {
      timeZone: company.timezone,
      hour: '2-digit',
      minute: '2-digit',
      numberingSystem: 'latn',
    }).format(new Date(iso));
  const manage = can('workshop.job.manage');
  const longDate = new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en-GB', {
    dateStyle: 'full',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));

  return (
    <>
      <PageHeader
        title={t('appt.title')}
        actions={
          manage ? (
            <Link className={buttonSecondary} href={`${base}/settings?branch=${branchId}`}>
              {t('appt.hours')}
            </Link>
          ) : null
        }
      >
        {longDate}
      </PageHeader>
      <Card className="mb-6">
        <form method="get" className="flex flex-wrap items-end gap-3" aria-label={t('appt.date')}>
          <label className="flex flex-col gap-1.5 text-[13px] font-medium" htmlFor="appt-branch">
            {t('job.branch')}
            <select id="appt-branch" name="branch" defaultValue={branchId} className={`${inputClass} w-52`}>
              {list.map((b) => (
                <option key={b.id} value={b.id}>{`${b.code} — ${localName(b, locale)}`}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-medium" htmlFor="appt-date">
            {t('appt.date')}
            <input
              id="appt-date"
              name="date"
              type="date"
              defaultValue={date}
              dir="ltr"
              className={`${inputClass} w-44`}
            />
          </label>
          <button type="submit" className={buttonPrimary}>
            {t('ledger.apply')}
          </button>
          <nav className="flex gap-2 sm:ms-auto" aria-label={t('appt.date')}>
            <Link className={buttonGhost} href={href(addDays(date, -1))}>
              {t('appt.prevDay')}
            </Link>
            <Link
              className={buttonGhost}
              href={href(today)}
              aria-current={date === today ? 'date' : undefined}
            >
              {t('appt.today')}
            </Link>
            <Link className={buttonGhost} href={href(addDays(date, 1))}>
              {t('appt.nextDay')}
            </Link>
          </nav>
        </form>
      </Card>
      {!day.ok ? (
        <ProblemNotice result={day} locale={locale} />
      ) : !day.data.schedule.configured ? (
        <Notice>
          {t('appt.notConfigured')}{' '}
          {manage ? (
            <Link href={`${base}/settings?branch=${branchId}`} className="font-semibold underline">
              {t('appt.setHours')}
            </Link>
          ) : null}
        </Notice>
      ) : day.data.slots.length === 0 ? (
        <Notice>{t('appt.closed')}</Notice>
      ) : (
        <Card flush>
          <Table caption={`${t('appt.title')} ${date}`}>
            <thead>
              <tr>
                <th scope="col" className={th}>
                  {t('appt.time')}
                </th>
                <th scope="col" className={th}>
                  {t('appt.bays')}
                </th>
                <th scope="col" className={th}>
                  {t('appt.title')}
                </th>
              </tr>
            </thead>
            <tbody>
              {day.data.slots.map((s) => {
                const starting = day.data.appointments.filter(
                  (a: Appointment) => a.startsAt >= s.start && a.startsAt < s.end,
                );
                const bookable = manage && s.free > 0 && s.start > new Date().toISOString();
                return (
                  <tr key={s.start} data-slot={timeOf(s.start)}>
                    <th scope="row" className={`${td} w-24 text-start font-medium`}>
                      <Ltr>{timeOf(s.start)}</Ltr>
                    </th>
                    <td className={`${td} w-44`}>
                      {s.free === 0 ? (
                        <Badge tone="danger">{t('appt.full')}</Badge>
                      ) : (
                        <span className="text-sm text-[var(--color-text-muted)]">
                          {t('appt.free')
                            .replace('{free}', String(s.free))
                            .replace('{bays}', String(day.data.schedule.bays))}
                        </span>
                      )}
                    </td>
                    <td className={td}>
                      <div className="flex flex-wrap items-center gap-2">
                        {starting.map((a) => (
                          <Link
                            key={a.id}
                            href={`${base}/${a.id}`}
                            className="inline-flex flex-wrap items-center gap-2 rounded-lg border border-[var(--color-border)] px-2 py-1 text-sm hover:border-[var(--color-primary)]"
                          >
                            <Ltr className="font-semibold">{a.vehicle.plate}</Ltr>
                            <span>{a.service}</span>
                            <span className="text-xs text-[var(--color-text-muted)]">
                              {t('appt.minutes').replace('{n}', String(a.durationMinutes))}
                            </span>
                            <Badge tone={TONE[a.status as keyof typeof TONE] ?? 'neutral'}>
                              {t(`appt.status.${a.status}` as MessageKey)}
                            </Badge>
                          </Link>
                        ))}
                        {bookable ? (
                          <Link
                            className={`${buttonGhost} min-h-8 px-2 text-xs`}
                            href={`${base}/new?branch=${branchId}&start=${encodeURIComponent(s.start)}`}
                          >
                            + {t('appt.book')}
                          </Link>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}
      <p className="mt-4 text-xs text-[var(--color-text-muted)]">{t('appt.reminderNote')}</p>
    </>
  );
}
