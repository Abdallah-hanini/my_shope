'use server';

import { unwrap } from '@erp/api-client';
import { resolveLocale } from '@erp/localization';
import { createBaySchema, placeJobBaySchema, updateBaySchema } from '@erp/validation';
import { redirect } from 'next/navigation';
import { formValues, mutate, validate } from '@/lib/actions';
import type { FormState } from '@/lib/form-state';

// Bays (WEB-022). The API decides who may set up bays and move cars.

/** Put a job's car on a bay, move it, or release it (empty bayId); `back` is the page to return to. */
export async function placeBayAction(
  localeRaw: string,
  companyId: string,
  jobId: string,
  back: string,
  _p: FormState,
  form: FormData,
): Promise<FormState> {
  const locale = resolveLocale(localeRaw);
  const values = formValues(form);
  const v = validate(placeJobBaySchema, { version: Number(values.version), bayId: values.bayId || null });
  if (!v.ok) return { fieldErrors: v.fieldErrors, values };
  const failed = await mutate(locale, values, async (api) => {
    unwrap(
      await api.POST('/api/v1/companies/{companyId}/jobs/{jobId}/bay', {
        params: { path: { companyId, jobId } },
        body: v.data,
      }),
    );
  });
  if (failed) return failed;
  redirect(back.startsWith(`/${locale}/c/${companyId}/`) ? back : `/${locale}/c/${companyId}/bays`);
}

export async function createBayAction(
  localeRaw: string,
  companyId: string,
  branchId: string,
  _p: FormState,
  form: FormData,
): Promise<FormState> {
  const locale = resolveLocale(localeRaw);
  const values = formValues(form);
  const v = validate(createBaySchema, { code: values.code ?? '', name: values.name });
  if (!v.ok) return { fieldErrors: v.fieldErrors, values };
  const failed = await mutate(locale, values, async (api) => {
    unwrap(
      await api.POST('/api/v1/companies/{companyId}/branches/{branchId}/bays', {
        params: { path: { companyId, branchId } },
        body: v.data,
      }),
    );
  });
  if (failed) return failed;
  redirect(`/${locale}/c/${companyId}/bays?branch=${branchId}`);
}

export async function updateBayAction(
  localeRaw: string,
  companyId: string,
  branchId: string,
  bayId: string,
  _p: FormState,
  form: FormData,
): Promise<FormState> {
  const locale = resolveLocale(localeRaw);
  const values = formValues(form);
  const v = validate(updateBaySchema, {
    version: Number(values.version),
    name: values.name,
    active: values.active === 'true',
  });
  if (!v.ok) return { fieldErrors: v.fieldErrors, values };
  const failed = await mutate(locale, values, async (api) => {
    unwrap(
      await api.PATCH('/api/v1/companies/{companyId}/bays/{bayId}', {
        params: { path: { companyId, bayId } },
        body: v.data,
      }),
    );
  });
  if (failed) return failed;
  redirect(`/${locale}/c/${companyId}/bays?branch=${branchId}`);
}
