'use server';

import { unwrap } from '@erp/api-client';
import { resolveLocale } from '@erp/localization';
import { manualTimeEntrySchema, voidTimeEntrySchema } from '@erp/validation';
import { redirect } from 'next/navigation';
import { formValues, mutate, validate } from '@/lib/actions';
import type { FormState } from '@/lib/form-state';
import { zonedLocalToIso } from '@/lib/time';

// Labour time (WEB-023). The API decides who may clock, correct or void; these only pass input.

/** Clock on to a task, or off an open entry; `back` is the page to return to (job or board). */
export async function clockAction(
  localeRaw: string,
  companyId: string,
  target: { op: 'on'; jobId: string; taskId: string } | { op: 'off'; entryId: string },
  back: string,
  _p: FormState,
  form: FormData,
): Promise<FormState> {
  const locale = resolveLocale(localeRaw);
  const values = formValues(form);
  const failed = await mutate(locale, values, async (api) => {
    unwrap(
      target.op === 'on'
        ? await api.POST('/api/v1/companies/{companyId}/jobs/{jobId}/tasks/{taskId}/clock-on', {
            params: { path: { companyId, jobId: target.jobId, taskId: target.taskId } },
          })
        : await api.POST('/api/v1/companies/{companyId}/time-entries/{entryId}/clock-off', {
            params: { path: { companyId, entryId: target.entryId } },
          }),
    );
  });
  if (failed) return failed;
  redirect(back.startsWith(`/${locale}/c/${companyId}/`) ? back : `/${locale}/c/${companyId}/jobs`);
}

export async function manualTimeAction(
  localeRaw: string,
  companyId: string,
  jobId: string,
  timeZone: string,
  _p: FormState,
  form: FormData,
): Promise<FormState> {
  const locale = resolveLocale(localeRaw);
  const values = formValues(form);
  const v = validate(manualTimeEntrySchema, {
    taskId: values.taskId,
    technicianId: values.technicianId,
    startedAt: values.startedAt ? zonedLocalToIso(values.startedAt, timeZone) : undefined,
    endedAt: values.endedAt ? zonedLocalToIso(values.endedAt, timeZone) : undefined,
    reason: values.reason,
  });
  if (!v.ok) return { fieldErrors: v.fieldErrors, values };
  const failed = await mutate(locale, values, async (api) => {
    unwrap(
      await api.POST('/api/v1/companies/{companyId}/jobs/{jobId}/time-entries', {
        params: { path: { companyId, jobId } },
        body: v.data,
      }),
    );
  });
  if (failed) return failed;
  redirect(`/${locale}/c/${companyId}/jobs/${jobId}#labour-title`);
}

export async function voidTimeAction(
  localeRaw: string,
  companyId: string,
  jobId: string,
  entryId: string,
  _p: FormState,
  form: FormData,
): Promise<FormState> {
  const locale = resolveLocale(localeRaw);
  const values = formValues(form);
  const v = validate(voidTimeEntrySchema, { reason: values.reason });
  if (!v.ok) return { fieldErrors: v.fieldErrors, values };
  const failed = await mutate(locale, values, async (api) => {
    unwrap(
      await api.POST('/api/v1/companies/{companyId}/time-entries/{entryId}/void', {
        params: { path: { companyId, entryId } },
        body: v.data,
      }),
    );
  });
  if (failed) return failed;
  redirect(`/${locale}/c/${companyId}/jobs/${jobId}#labour-title`);
}
