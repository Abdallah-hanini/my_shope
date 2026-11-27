import { unwrap } from '@erp/api-client';
import { createTranslator, isLocale } from '@erp/localization';
import { notFound } from 'next/navigation';
import { ProblemNotice } from '@/components/ProblemNotice';
import { SimpleForm } from '@/components/SimpleForm';
import { Card, PageHeader } from '@/components/ui';
import { attempt } from '@/lib/api';
import { loadCompany } from '@/lib/context';
import { isoToZonedLocal } from '@/lib/time';
import { bookAppointmentAction } from '../../appointment-actions';

const UUID = /^[0-9a-f-]{36}$/i;

/** WEB-011 book a service appointment (from a free slot of the calendar). */
export default async function NewAppointmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; companyId: string }>;
  searchParams: Promise<{ branch?: string; start?: string; vehicle?: string }>;
}) {
  const { locale, companyId } = await params;
  const sp = await searchParams;
  if (!isLocale(locale) || !sp.branch || !UUID.test(sp.branch)) notFound();
  const t = createTranslator(locale);
  const ctx = await loadCompany(companyId);
  if (!ctx.ok) return null;
  const { api, company } = ctx.data;
  const [vehicles, sched] = await Promise.all([
    attempt(async () =>
      unwrap(await api.GET('/api/v1/companies/{companyId}/vehicles', { params: { path: { companyId } } })),
    ),
    attempt(async () =>
      unwrap(
        await api.GET('/api/v1/companies/{companyId}/branches/{branchId}/workshop-schedule', {
          params: { path: { companyId, branchId: sp.branch! } },
        }),
      ),
    ),
  ]);
  if (!vehicles.ok) return <ProblemNotice result={vehicles} locale={locale} />;
  if (!sched.ok) return <ProblemNotice result={sched} locale={locale} />;
  const slot = sched.data.slotMinutes;
  const lengths = [1, 2, 3, 4, 6, 8, 12, 16].map((n) => n * slot).filter((m) => m <= 480);
  const start =
    sp.start && !Number.isNaN(Date.parse(sp.start)) ? isoToZonedLocal(sp.start, company.timezone) : '';
  return (
    <>
      <PageHeader
        title={t('appt.new')}
        back={{ href: `/${locale}/c/${companyId}/appointments`, label: t('nav.appointments') }}
      >
        {t('appt.reminderNote')}
      </PageHeader>
      <Card>
        <SimpleForm
          locale={locale}
          idPrefix="appt"
          columns={2}
          hidden={{ branchId: sp.branch }}
          action={bookAppointmentAction.bind(null, locale, companyId, company.timezone)}
          submitLabel={t('appt.book')}
          fields={[
            {
              name: 'vehicleId',
              label: t('appt.vehicle'),
              type: 'select',
              required: true,
              defaultValue: sp.vehicle ?? vehicles.data[0]?.id ?? '',
              options: vehicles.data.map((v) => ({
                value: v.id,
                label: `${v.plate} — ${v.make} ${v.model} (${v.customerName})`,
              })),
            },
            {
              name: 'startsAt',
              label: t('appt.start'),
              type: 'datetime-local',
              required: true,
              dir: 'ltr',
              defaultValue: start,
            },
            {
              name: 'durationMinutes',
              label: t('appt.duration'),
              type: 'select',
              required: true,
              defaultValue: String(lengths.find((m) => m >= 60) ?? slot),
              options: lengths.map((m) => ({
                value: String(m),
                label: t('appt.minutes').replace('{n}', String(m)),
              })),
            },
            { name: 'service', label: t('appt.service'), required: true, maxLength: 500 },
            { name: 'notes', label: t('appt.notes'), type: 'textarea', maxLength: 1000 },
          ]}
        />
      </Card>
    </>
  );
}
