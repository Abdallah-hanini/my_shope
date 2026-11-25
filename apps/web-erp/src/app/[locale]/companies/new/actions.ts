'use server';

import { unwrap } from '@erp/api-client';
import { resolveLocale } from '@erp/localization';
import { createCompanySchema } from '@erp/validation';
import { redirect } from 'next/navigation';
import { formValues, mutate, validate } from '@/lib/actions';
import type { FormState } from '@/lib/form-state';

export async function createCompanyAction(
  localeRaw: string,
  adminUserId: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const locale = resolveLocale(localeRaw);
  const values = formValues(form);
  const v = validate(createCompanySchema, {
    code: values.code,
    legalName: values.legalName,
    legalNameAr: values.legalNameAr?.trim() ? values.legalNameAr : undefined,
    baseCurrency: values.baseCurrency,
    timezone: values.timezone,
    initialAdminUserId: adminUserId,
  });
  if (!v.ok) return { fieldErrors: v.fieldErrors, values };
  let companyId = '';
  const failed = await mutate(locale, values, async (api) => {
    companyId = unwrap(await api.POST('/api/v1/companies', { body: v.data })).id;
  });
  if (failed) return failed;
  redirect(`/${locale}/c/${companyId}`);
}
