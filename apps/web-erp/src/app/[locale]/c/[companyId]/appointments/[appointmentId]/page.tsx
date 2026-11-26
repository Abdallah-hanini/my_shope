import { unwrap } from '@erp/api-client';
import { createTranslator, formatDateTime, isLocale, type MessageKey } from '@erp/localization';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProblemNotice } from '@/components/ProblemNotice';
import { Badge, buttonPrimary, buttonSecondary, Card, inputClass, Ltr, PageHeader } from '@/components/ui';
import { InlineForm } from '@/components/workshop/InlineForm';
import { attempt } from '@/lib/api';
import { loadCompany } from '@/lib/context';
import { isoToZonedLocal } from '@/lib/time';
import { appointmentStepAction } from '../../appointment-actions';

const UUID = /^[0-9a-f-]{36}$/i;
const TONE = { booked: 'info', checked_in: 'success', cancelled: 'neutral', no_show: 'warning' } as const;

export default async function AppointmentPage({
  params,
}: {
  params: Promise<{ locale: string; companyId: string; appointmentId: string }>;
}) {
  const { locale, companyId, appointmentId } = await params;
  if (!isLocale(locale) || !UUID.test(appointmentId)) notFound();
  const t = createTranslator(locale);
  const ctx = await loadCompany(companyId);
  if (!ctx.ok) return null;
  const { api, company } = ctx.data;
  const res = await attempt(async () =>
    unwrap(
      await api.GET('/api/v1/companies/{companyId}/appointments/{appointmentId}', {
        params: { path: { companyId, appointmentId } },
      }),
    ),
  );
  if (!res.ok) {
    if (res.status === 404) notFound();
    return <ProblemNotice result={res} locale={locale} />;
  }
  const a = res.data;
  const tz = company.timezone;
  const base = `/${locale}/c/${companyId}`;
  const can = (x: string) => a.actions.includes(x);
  const step = (op: 'reschedule' | 'cancel' | 'no-show') =>
    appointmentStepAction.bind(null, locale, companyId, a.id, op, tz);
  const version = <input type="hidden" name="version" value={a.version} />;
  const localDate = isoToZonedLocal(a.startsAt, tz).slice(0, 10);
  return (
    <>
      <PageHeader
        title={`${formatDateTime(locale, a.startsAt, tz)}`}
        actions={
          can('checkIn') ? (
            <Link
              className={buttonPrimary}
              href={`${base}/jobs/new?vehicle=${a.vehicle.id}&branch=${a.branchId}&appointment=${a.id}`}
            >
              {t('appt.checkIn')}
            </Link>
          ) : null
        }
      >
        <span className="inline-flex flex-wrap items-center gap-2">
          <Badge tone={TONE[a.status as keyof typeof TONE] ?? 'neutral'}>
            {t(`appt.status.${a.status}` as MessageKey)}
          </Badge>
          <Link href={`${base}/vehicles/${a.vehicle.id}`} className="font-medium hover:underline">
            <Ltr>{a.vehicle.plate}</Ltr> · {a.vehicle.make} {a.vehicle.model}
          </Link>
          · {a.customer.name} <Ltr>{a.customer.phone}</Ltr> · {a.branchCode}
        </span>
      </PageHeader>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title={t('appt.service')} id="appt">
            <p>{a.service}</p>
            {a.notes ? (
              <p className="mt-2 whitespace-pre-line text-sm text-[var(--color-text-muted)]">{a.notes}</p>
            ) : null}
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-[var(--color-text-muted)]">{t('appt.duration')}</dt>
                <dd className="font-medium">{t('appt.minutes').replace('{n}', String(a.durationMinutes))}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--color-text-muted)]">{t('appt.bookedBy')}</dt>
                <dd className="font-medium">{a.createdByName}</dd>
              </div>
              {a.jobId ? (
                <div>
                  <dt className="text-xs text-[var(--color-text-muted)]">{t('appt.job')}</dt>
                  <dd className="font-medium">
                    <Link
                      href={`${base}/jobs/${a.jobId}`}
                      className="text-[var(--color-primary)] hover:underline"
                    >
                      <Ltr>{a.jobNumber}</Ltr>
                    </Link>
                  </dd>
                </div>
              ) : null}
              {a.cancelledReason ? (
                <div>
                  <dt className="text-xs text-[var(--color-text-muted)]">{t('appt.reason')}</dt>
                  <dd className="font-medium">{a.cancelledReason}</dd>
                </div>
              ) : null}
            </dl>
          </Card>
          <p>
            <Link
              href={`${base}/appointments?branch=${a.branchId}&date=${localDate}`}
              className="text-sm font-medium text-[var(--color-primary)] hover:underline"
            >
              {t('common.back')}
            </Link>
          </p>
        </div>
        <aside className="flex flex-col gap-4" aria-label={t('common.actions')}>
          {can('reschedule') ? (
            <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <h2 className="mb-2 text-sm font-semibold">{t('appt.reschedule')}</h2>
              <InlineForm
                action={step('reschedule')}
                locale={locale}
                submitLabel={t('appt.reschedule')}
                submitClassName={buttonSecondary}
                className="flex flex-col gap-3"
              >
                {version}
                <label className="flex flex-col gap-1.5 text-[13px] font-medium" htmlFor="re-start">
                  {t('appt.start')}
                  <input
                    id="re-start"
                    name="startsAt"
                    type="datetime-local"
                    defaultValue={isoToZonedLocal(a.startsAt, tz)}
                    dir="ltr"
                    className={inputClass}
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-[13px] font-medium" htmlFor="re-dur">
                  {t('appt.duration')}
                  <input
                    id="re-dur"
                    name="durationMinutes"
                    type="number"
                    min={15}
                    max={480}
                    step={15}
                    defaultValue={a.durationMinutes}
                    dir="ltr"
                    className={inputClass}
                  />
                </label>
              </InlineForm>
            </section>
          ) : null}
          {can('noShow') ? (
            <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <InlineForm
                action={step('no-show')}
                locale={locale}
                submitLabel={t('appt.noShow')}
                submitClassName={buttonSecondary}
              >
                {version}
              </InlineForm>
            </section>
          ) : null}
          {can('cancel') ? (
            <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <h2 className="mb-2 text-sm font-semibold">{t('appt.cancel')}</h2>
              <InlineForm
                action={step('cancel')}
                locale={locale}
                submitLabel={t('appt.cancel')}
                submitClassName={buttonSecondary}
                className="flex flex-col gap-3"
              >
                {version}
                <label className="flex flex-col gap-1.5 text-[13px] font-medium" htmlFor="cx-reason">
                  {t('appt.reason')}
                  <input id="cx-reason" name="reason" maxLength={500} className={inputClass} />
                </label>
              </InlineForm>
            </section>
          ) : null}
        </aside>
      </div>
    </>
  );
}
