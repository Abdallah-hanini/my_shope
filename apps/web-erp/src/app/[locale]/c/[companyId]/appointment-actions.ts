'use server';

import { unwrap } from '@erp/api-client';
import { resolveLocale } from '@erp/localization';
import {
  cancelAppointmentSchema,
  createAppointmentSchema,
  jobVersionSchema,
  rescheduleAppointmentSchema,
  workshopScheduleSchema,
} from '@erp/validation';
import { redirect } from 'next/navigation';
import { formValues, mutate, validate } from '@/lib/actions';
import type { FormState } from '@/lib/form-state';
import { zonedLocalToIso } from '@/lib/time';

const blank = (v: string | undefined) => (v === undefined || v.trim() === '' ? undefined : v.trim());

export async function setWorkshopHoursAction(
  localeRaw: string,
  companyId: string,
  branchId: string,
  _p: FormState,
  form: FormData,
): Promise<FormState> {
  const locale = resolveLocale(localeRaw);
  const values = formValues(form);
  const hours = [0, 1, 2, 3, 4, 5, 6]
    .filter((d) => values[`open_${d}`] === 'on')
    .map((d) => ({ weekday: d, opens: values[`opens_${d}`] ?? '', closes: values[`closes_${d}`] ?? '' }));
  const v = validate(workshopScheduleSchema, {
    version: Number(values.version),
    bays: values.bays,
    slotMinutes: values.slotMinutes,
    hours,
  });
  if (!v.ok) return { fieldErrors: v.fieldErrors, values };
  const failed = await mutate(locale, values, async (api) => {
    unwrap(
      await api.PUT('/api/v1/companies/{companyId}/branches/{branchId}/workshop-schedule', {
        params: { path: { companyId, branchId } },
        body: { ...v.data, slotMinutes: Number(v.data.slotMinutes) as 15 | 30 | 60 },
      }),
    );
  });
  if (failed) return failed;
  redirect(`/${locale}/c/${companyId}/appointments?branch=${branchId}`);
}

export async function bookAppointmentAction(
  localeRaw: string,
  companyId: string,
  timeZone: string,
  _p: FormState,
  form: FormData,
): Promise<FormState> {
  const locale = resolveLocale(localeRaw);
  const values = formValues(form);
  const v = validate(createAppointmentSchema, {
    branchId: values.branchId,
    vehicleId: values.vehicleId,
    startsAt: zonedLocalToIso(values.startsAt ?? '', timeZone) ?? values.startsAt,
    durationMinutes: values.durationMinutes,
    service: values.service,
    notes: blank(values.notes),
  });
  if (!v.ok) return { fieldErrors: v.fieldErrors, values };
  let id = '';
  const failed = await mutate(locale, values, async (api) => {
    id = unwrap(
      await api.POST('/api/v1/companies/{companyId}/appointments', {
        params: { path: { companyId } },
        body: v.data,
      }),
    ).id;
  });
  if (failed) return failed;
  redirect(`/${locale}/c/${companyId}/appointments/${id}`);
}

type Op = 'reschedule' | 'cancel' | 'no-show';

export async function appointmentStepAction(
  localeRaw: string,
  companyId: string,
  appointmentId: string,
  op: Op,
  timeZone: string,
  _p: FormState,
  form: FormData,
): Promise<FormState> {
  const locale = resolveLocale(localeRaw);
  const values = formValues(form);
  const version = Number(values.version);
  const path = { params: { path: { companyId, appointmentId } } };
  const parsed =
    op === 'reschedule'
      ? validate(rescheduleAppointmentSchema, {
          version,
          startsAt: zonedLocalToIso(values.startsAt ?? '', timeZone) ?? values.startsAt,
          durationMinutes: values.durationMinutes,
        })
      : op === 'cancel'
        ? validate(cancelAppointmentSchema, { version, reason: values.reason })
        : validate(jobVersionSchema, { version });
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors, values };
  const failed = await mutate(locale, values, async (api) => {
    const body = parsed.data as never;
    unwrap(
      op === 'reschedule'
        ? await api.POST('/api/v1/companies/{companyId}/appointments/{appointmentId}/reschedule', {
            ...path,
            body,
          })
        : op === 'cancel'
          ? await api.POST('/api/v1/companies/{companyId}/appointments/{appointmentId}/cancel', {
              ...path,
              body,
            })
          : await api.POST('/api/v1/companies/{companyId}/appointments/{appointmentId}/no-show', {
              ...path,
              body,
            }),
    );
  });
  if (failed) return failed;
  redirect(`/${locale}/c/${companyId}/appointments/${appointmentId}`);
}
