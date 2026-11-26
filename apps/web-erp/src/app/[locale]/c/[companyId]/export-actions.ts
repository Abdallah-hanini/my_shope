'use server';

import { unwrap } from '@erp/api-client';
import { resolveLocale } from '@erp/localization';
import { createExportSchema } from '@erp/validation';
import { redirect } from 'next/navigation';
import { formValues, mutate, validate } from '@/lib/actions';
import type { FormState } from '@/lib/form-state';

const blank = (v: string | undefined) => (v === undefined || v.trim() === '' ? undefined : v.trim());

/** Queues an export (WEB-205) and opens the export centre, where it appears with its status. */
export async function requestExportAction(
  localeRaw: string,
  companyId: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const locale = resolveLocale(localeRaw);
  const values = formValues(form);
  const kind = values.kind;
  const params: Record<string, unknown> = { from: values.from, to: values.to };
  if (blank(values.branchId)) params.branchId = blank(values.branchId);
  if (kind === 'trial_balance') params.includeZero = values.includeZero === '1';
  if (kind === 'general_ledger') params.accountId = blank(values.accountId);
  const v = validate(createExportSchema, {
    kind,
    format: values.format,
    locale: values.fileLocale || locale,
    params,
  });
  if (!v.ok) {
    // Nested paths ("params.accountId") are shown next to the matching field.
    const fieldErrors = Object.fromEntries(
      Object.entries(v.fieldErrors).map(([k, m]) => [k.replace(/^params\./, ''), m]),
    );
    return { fieldErrors, values };
  }
  let id = '';
  const failed = await mutate(locale, values, async (api) => {
    id = unwrap(
      await api.POST('/api/v1/companies/{companyId}/exports', {
        params: { path: { companyId } },
        body: v.data,
      }),
    ).id;
  });
  if (failed) return failed;
  redirect(`/${locale}/c/${companyId}/exports?new=${id}`);
}
