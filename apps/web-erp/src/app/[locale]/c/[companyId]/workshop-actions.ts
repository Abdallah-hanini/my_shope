'use server';

import { unwrap } from '@erp/api-client';
import { resolveLocale } from '@erp/localization';
import {
  assignTaskSchema,
  authorizeJobSchema,
  cancelJobSchema,
  createCustomerSchema,
  createJobSchema,
  createVehicleSchema,
  deliverJobSchema,
  jobNoteSchema,
  jobVersionSchema,
  promiseJobSchema,
  qcResultSchema,
  updateCustomerSchema,
  updateJobDraftSchema,
  updateVehicleSchema,
} from '@erp/validation';
import { redirect } from 'next/navigation';
import { formValues, mutate, validate } from '@/lib/actions';
import type { FormState } from '@/lib/form-state';
import { zonedLocalToIso } from '@/lib/time';

const blank = (v: string | undefined) => (v === undefined || v.trim() === '' ? undefined : v.trim());
const strings = (form: FormData, name: string) =>
  form.getAll(name).filter((v): v is string => typeof v === 'string');

// ── customers and vehicles ──────────────────────────────────────────────────

export async function createCustomerAction(
  localeRaw: string,
  companyId: string,
  _p: FormState,
  form: FormData,
): Promise<FormState> {
  const locale = resolveLocale(localeRaw);
  const values = formValues(form);
  const v = validate(createCustomerSchema, {
    ...values,
    nameAr: blank(values.nameAr),
    email: blank(values.email) ?? null,
    notes: blank(values.notes),
  });
  if (!v.ok) return { fieldErrors: v.fieldErrors, values };
  let id = '';
  const failed = await mutate(locale, values, async (api) => {
    id = unwrap(
      await api.POST('/api/v1/companies/{companyId}/customers', {
        params: { path: { companyId } },
        body: v.data,
      }),
    ).id;
  });
  if (failed) return failed;
  redirect(`/${locale}/c/${companyId}/customers/${id}`);
}

export async function updateCustomerAction(
  localeRaw: string,
  companyId: string,
  customerId: string,
  _p: FormState,
  form: FormData,
): Promise<FormState> {
  const locale = resolveLocale(localeRaw);
  const values = formValues(form);
  const v = validate(updateCustomerSchema, {
    ...values,
    nameAr: blank(values.nameAr),
    email: blank(values.email) ?? null,
    notes: blank(values.notes),
    version: Number(values.version),
  });
  if (!v.ok) return { fieldErrors: v.fieldErrors, values };
  const failed = await mutate(locale, values, async (api) => {
    unwrap(
      await api.PATCH('/api/v1/companies/{companyId}/customers/{customerId}', {
        params: { path: { companyId, customerId } },
        body: v.data,
      }),
    );
  });
  if (failed) return failed;
  redirect(`/${locale}/c/${companyId}/customers/${customerId}`);
}

function vehicleInput(values: Record<string, string>) {
  return {
    ...values,
    vin: blank(values.vin) ?? null,
    year: blank(values.year) ?? null,
    color: blank(values.color),
  };
}

export async function createVehicleAction(
  localeRaw: string,
  companyId: string,
  _p: FormState,
  form: FormData,
): Promise<FormState> {
  const locale = resolveLocale(localeRaw);
  const values = formValues(form);
  const v = validate(createVehicleSchema, vehicleInput(values));
  if (!v.ok) return { fieldErrors: v.fieldErrors, values };
  let id = '';
  const failed = await mutate(locale, values, async (api) => {
    id = unwrap(
      await api.POST('/api/v1/companies/{companyId}/vehicles', {
        params: { path: { companyId } },
        body: v.data,
      }),
    ).id;
  });
  if (failed) return failed;
  redirect(`/${locale}/c/${companyId}/vehicles/${id}`);
}

export async function updateVehicleAction(
  localeRaw: string,
  companyId: string,
  vehicleId: string,
  _p: FormState,
  form: FormData,
): Promise<FormState> {
  const locale = resolveLocale(localeRaw);
  const values = formValues(form);
  const v = validate(updateVehicleSchema, { ...vehicleInput(values), version: Number(values.version) });
  if (!v.ok) return { fieldErrors: v.fieldErrors, values };
  const failed = await mutate(locale, values, async (api) => {
    unwrap(
      await api.PATCH('/api/v1/companies/{companyId}/vehicles/{vehicleId}', {
        params: { path: { companyId, vehicleId } },
        body: v.data,
      }),
    );
  });
  if (failed) return failed;
  redirect(`/${locale}/c/${companyId}/vehicles/${vehicleId}`);
}

// ── job cards ───────────────────────────────────────────────────────────────

function jobInput(form: FormData, values: Record<string, string>, timeZone: string) {
  const descriptions = strings(form, 'taskDescription');
  const hours = strings(form, 'taskHours');
  const tasks = descriptions
    .map((d, i) => ({ description: d.trim(), estimatedHours: (hours[i] ?? '').trim() }))
    .filter((t) => t.description || t.estimatedHours);
  return {
    complaint: values.complaint,
    odometerIn: values.odometerIn,
    fuelLevel: values.fuelLevel,
    promisedAt: blank(values.promisedAt) ? zonedLocalToIso(values.promisedAt!, timeZone) : null,
    tasks,
  };
}
/** Keeps the typed task rows on a validation error (as "desc\u0001hours" lines). */
function keepTasks(form: FormData) {
  const h = strings(form, 'taskHours');
  return strings(form, 'taskDescription')
    .map((d, i) => `${d}\u0001${h[i] ?? ''}`)
    .join('\n');
}

export async function createJobAction(
  localeRaw: string,
  companyId: string,
  timeZone: string,
  _p: FormState,
  form: FormData,
): Promise<FormState> {
  const locale = resolveLocale(localeRaw);
  const values: Record<string, string> = { ...formValues(form), tasks: keepTasks(form) };
  const v = validate(createJobSchema, {
    branchId: values.branchId,
    vehicleId: values.vehicleId,
    ...jobInput(form, values, timeZone),
  });
  if (!v.ok) return { fieldErrors: v.fieldErrors, values };
  let id = '';
  const failed = await mutate(locale, values, async (api) => {
    id = unwrap(
      await api.POST('/api/v1/companies/{companyId}/jobs', { params: { path: { companyId } }, body: v.data }),
    ).id;
  });
  if (failed) return failed;
  redirect(`/${locale}/c/${companyId}/jobs/${id}`);
}

export async function updateJobDraftAction(
  localeRaw: string,
  companyId: string,
  jobId: string,
  timeZone: string,
  _p: FormState,
  form: FormData,
): Promise<FormState> {
  const locale = resolveLocale(localeRaw);
  const values: Record<string, string> = { ...formValues(form), tasks: keepTasks(form) };
  const v = validate(updateJobDraftSchema, {
    ...jobInput(form, values, timeZone),
    version: Number(values.version),
  });
  if (!v.ok) return { fieldErrors: v.fieldErrors, values };
  const failed = await mutate(locale, values, async (api) => {
    unwrap(
      await api.PATCH('/api/v1/companies/{companyId}/jobs/{jobId}', {
        params: { path: { companyId, jobId } },
        body: v.data,
      }),
    );
  });
  if (failed) return failed;
  redirect(`/${locale}/c/${companyId}/jobs/${jobId}`);
}

type JobOp =
  | 'authorize'
  | 'start'
  | 'submit-qc'
  | 'qc'
  | 'deliver'
  | 'cancel'
  | 'promise'
  | 'notes'
  | 'assign'
  | 'complete';

/** One server action for every job-card step; the API decides whether it is allowed. */
export async function jobStepAction(
  localeRaw: string,
  companyId: string,
  jobId: string,
  op: JobOp,
  extra: { taskId?: string; timeZone?: string },
  _p: FormState,
  form: FormData,
): Promise<FormState> {
  const locale = resolveLocale(localeRaw);
  const values = formValues(form);
  const version = Number(values.version);
  const path = { companyId, jobId };
  const parsed =
    op === 'authorize'
      ? validate(authorizeJobSchema, {
          version,
          authorizedByName: values.authorizedByName,
          authorizedVia: values.authorizedVia,
        })
      : op === 'qc'
        ? validate(
            qcResultSchema,
            values.result === 'fail'
              ? { result: 'fail', version, note: values.note, reopenTaskIds: strings(form, 'reopenTaskIds') }
              : { result: 'pass', version, note: blank(values.note) },
          )
        : op === 'deliver'
          ? validate(deliverJobSchema, {
              version,
              deliveredToName: values.deliveredToName,
              odometerOut: values.odometerOut,
            })
          : op === 'cancel'
            ? validate(cancelJobSchema, { version, reason: values.reason })
            : op === 'promise'
              ? validate(promiseJobSchema, {
                  version,
                  promisedAt: blank(values.promisedAt)
                    ? zonedLocalToIso(values.promisedAt!, extra.timeZone ?? 'UTC')
                    : null,
                })
              : op === 'notes'
                ? validate(jobNoteSchema, { note: values.note })
                : op === 'assign'
                  ? validate(assignTaskSchema, { version, technicianId: blank(values.technicianId) ?? null })
                  : validate(jobVersionSchema, { version });
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors, values };
  const failed = await mutate(locale, values, async (api) => {
    const body = parsed.data as never;
    const r =
      op === 'assign'
        ? await api.POST('/api/v1/companies/{companyId}/jobs/{jobId}/tasks/{taskId}/assign', {
            params: { path: { ...path, taskId: extra.taskId! } },
            body,
          })
        : op === 'complete'
          ? await api.POST('/api/v1/companies/{companyId}/jobs/{jobId}/tasks/{taskId}/complete', {
              params: { path: { ...path, taskId: extra.taskId! } },
              body,
            })
          : op === 'authorize'
            ? await api.POST('/api/v1/companies/{companyId}/jobs/{jobId}/authorize', {
                params: { path },
                body,
              })
            : op === 'start'
              ? await api.POST('/api/v1/companies/{companyId}/jobs/{jobId}/start', { params: { path }, body })
              : op === 'submit-qc'
                ? await api.POST('/api/v1/companies/{companyId}/jobs/{jobId}/submit-qc', {
                    params: { path },
                    body,
                  })
                : op === 'qc'
                  ? await api.POST('/api/v1/companies/{companyId}/jobs/{jobId}/qc', {
                      params: { path },
                      body,
                    })
                  : op === 'deliver'
                    ? await api.POST('/api/v1/companies/{companyId}/jobs/{jobId}/deliver', {
                        params: { path },
                        body,
                      })
                    : op === 'cancel'
                      ? await api.POST('/api/v1/companies/{companyId}/jobs/{jobId}/cancel', {
                          params: { path },
                          body,
                        })
                      : op === 'promise'
                        ? await api.POST('/api/v1/companies/{companyId}/jobs/{jobId}/promise', {
                            params: { path },
                            body,
                          })
                        : await api.POST('/api/v1/companies/{companyId}/jobs/{jobId}/notes', {
                            params: { path },
                            body,
                          });
    unwrap(r);
  });
  if (failed) return failed;
  redirect(`/${locale}/c/${companyId}/jobs/${jobId}`);
}
