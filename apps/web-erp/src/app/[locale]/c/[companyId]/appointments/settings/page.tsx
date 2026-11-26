import { unwrap } from '@erp/api-client';
import { createTranslator, isLocale, type MessageKey } from '@erp/localization';
import { notFound } from 'next/navigation';
import { ProblemNotice } from '@/components/ProblemNotice';
import { Card, inputClass, PageHeader } from '@/components/ui';
import { InlineForm } from '@/components/workshop/InlineForm';
import { attempt } from '@/lib/api';
import { loadCompany, localName } from '@/lib/context';
import { setWorkshopHoursAction } from '../../appointment-actions';

const UUID = /^[0-9a-f-]{36}$/i;

/** Workshop hours and capacity of a branch (managers). */
export default async function WorkshopHoursPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; companyId: string }>;
  searchParams: Promise<{ branch?: string }>;
}) {
  const { locale, companyId } = await params;
  const branchId = (await searchParams).branch;
  if (!isLocale(locale) || !branchId || !UUID.test(branchId)) notFound();
  const t = createTranslator(locale);
  const ctx = await loadCompany(companyId);
  if (!ctx.ok) return null;
  const { api } = ctx.data;
  const [sched, branches] = await Promise.all([
    attempt(async () =>
      unwrap(
        await api.GET('/api/v1/companies/{companyId}/branches/{branchId}/workshop-schedule', {
          params: { path: { companyId, branchId } },
        }),
      ),
    ),
    attempt(async () =>
      unwrap(await api.GET('/api/v1/companies/{companyId}/branches', { params: { path: { companyId } } })),
    ),
  ]);
  if (!sched.ok) return <ProblemNotice result={sched} locale={locale} />;
  const s = sched.data;
  const branch = branches.ok ? branches.data.find((b) => b.id === branchId) : undefined;
  const byDay = new Map(s.hours.map((h) => [h.weekday, h]));
  // Week shown from Saturday (Qatar working week); stored as 0 = Sunday … 6 = Saturday.
  const order = [6, 0, 1, 2, 3, 4, 5];
  return (
    <>
      <PageHeader title={t('appt.hours')}>
        {branch ? `${branch.code} — ${localName(branch, locale)}` : null}
      </PageHeader>
      <Card>
        <p className="mb-4 text-sm text-[var(--color-text-muted)]">{t('appt.hoursHelp')}</p>
        <InlineForm
          action={setWorkshopHoursAction.bind(null, locale, companyId, branchId)}
          locale={locale}
          submitLabel={t('appt.saveHours')}
          className="flex flex-col gap-4"
          ariaLabel={t('appt.hours')}
        >
          <input type="hidden" name="version" value={s.version} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-[13px] font-medium" htmlFor="h-bays">
              {t('appt.bays')}
              <input
                id="h-bays"
                name="bays"
                type="number"
                min={1}
                max={50}
                required
                defaultValue={s.configured ? s.bays : ''}
                dir="ltr"
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-[13px] font-medium" htmlFor="h-slot">
              {t('appt.slotLength')}
              <select
                id="h-slot"
                name="slotMinutes"
                defaultValue={String(s.slotMinutes)}
                className={inputClass}
              >
                {[15, 30, 60].map((m) => (
                  <option key={m} value={m}>
                    {t('appt.minutes').replace('{n}', String(m))}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">{t('appt.hours')}</legend>
            <ul className="flex flex-col gap-2">
              {order.map((d) => {
                const h = byDay.get(d);
                const name = t(`weekday.${d}` as MessageKey);
                return (
                  <li key={d} className="grid grid-cols-[8rem_1fr_1fr] items-center gap-3">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name={`open_${d}`} defaultChecked={!!h} className="size-4" />{' '}
                      {name}
                    </label>
                    <input
                      name={`opens_${d}`}
                      type="time"
                      step={900}
                      defaultValue={h?.opens ?? '08:00'}
                      aria-label={`${name}: ${t('appt.opens')}`}
                      dir="ltr"
                      className={inputClass}
                    />
                    <input
                      name={`closes_${d}`}
                      type="time"
                      step={900}
                      defaultValue={h?.closes ?? '17:00'}
                      aria-label={`${name}: ${t('appt.closes')}`}
                      dir="ltr"
                      className={inputClass}
                    />
                  </li>
                );
              })}
            </ul>
          </fieldset>
        </InlineForm>
      </Card>
    </>
  );
}
