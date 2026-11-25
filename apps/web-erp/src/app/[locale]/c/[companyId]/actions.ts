'use server';

import { unwrap } from '@erp/api-client';
import { resolveLocale } from '@erp/localization';
import {
  closeFiscalPeriodSchema,
  createAccountSchema,
  createBranchSchema,
  createFiscalPeriodSchema,
  postJournalSchema,
  reverseJournalSchema,
} from '@erp/validation';
import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import { formValues, mutate, validate } from '@/lib/actions';
import type { FormState } from '@/lib/form-state';

const blankToUndefined = (v: string | undefined) =>
  v === undefined || v.trim() === '' ? undefined : v.trim();

export async function createBranchAction(
  localeRaw: string,
  companyId: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const locale = resolveLocale(localeRaw);
  const values = formValues(form);
  const v = validate(createBranchSchema, {
    code: values.code,
    name: values.name,
    nameAr: blankToUndefined(values.nameAr),
  });
  if (!v.ok) return { fieldErrors: v.fieldErrors, values };
  const failed = await mutate(locale, values, async (api) => {
    unwrap(
      await api.POST('/api/v1/companies/{companyId}/branches', {
        params: { path: { companyId } },
        body: v.data,
      }),
    );
  });
  if (failed) return failed;
  redirect(`/${locale}/c/${companyId}/branches`);
}

export async function createAccountAction(
  localeRaw: string,
  companyId: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const locale = resolveLocale(localeRaw);
  const values = formValues(form);
  const v = validate(createAccountSchema, {
    code: values.code,
    name: values.name,
    nameAr: blankToUndefined(values.nameAr),
    type: values.type,
    parentId: blankToUndefined(values.parentId) ?? null,
    isPosting: values.kind === 'posting',
  });
  if (!v.ok) return { fieldErrors: v.fieldErrors, values };
  const failed = await mutate(locale, values, async (api) => {
    unwrap(
      await api.POST('/api/v1/companies/{companyId}/accounts', {
        params: { path: { companyId } },
        body: v.data,
      }),
    );
  });
  if (failed) return failed;
  redirect(`/${locale}/c/${companyId}/accounts`);
}

export async function createPeriodAction(
  localeRaw: string,
  companyId: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const locale = resolveLocale(localeRaw);
  const values = formValues(form);
  const v = validate(createFiscalPeriodSchema, {
    name: values.name,
    startDate: values.startDate,
    endDate: values.endDate,
  });
  if (!v.ok) return { fieldErrors: v.fieldErrors, values };
  const failed = await mutate(locale, values, async (api) => {
    unwrap(
      await api.POST('/api/v1/companies/{companyId}/fiscal-periods', {
        params: { path: { companyId } },
        body: v.data,
      }),
    );
  });
  if (failed) return failed;
  redirect(`/${locale}/c/${companyId}/periods`);
}

export async function closePeriodAction(
  localeRaw: string,
  companyId: string,
  periodId: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const locale = resolveLocale(localeRaw);
  const values = formValues(form);
  const v = validate(closeFiscalPeriodSchema, { version: Number(values.version), reason: values.reason });
  if (!v.ok) return { fieldErrors: v.fieldErrors, values };
  const failed = await mutate(locale, values, async (api) => {
    unwrap(
      await api.POST('/api/v1/companies/{companyId}/fiscal-periods/{periodId}/close', {
        params: { path: { companyId, periodId } },
        body: v.data,
      }),
    );
  });
  if (failed) return failed;
  redirect(`/${locale}/c/${companyId}/periods`);
}

export async function postJournalAction(
  localeRaw: string,
  companyId: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const locale = resolveLocale(localeRaw);
  const values = formValues(form);
  let lines: unknown;
  try {
    lines = JSON.parse(values.lines ?? '[]');
  } catch {
    return { fieldErrors: { form: 'lines: malformed' }, values };
  }
  const key = values.idempotencyKey ?? '';
  const v = validate(postJournalSchema, {
    postingDate: values.postingDate,
    description: values.description,
    branchId: blankToUndefined(values.branchId) ?? null,
    lines,
  });
  if (!v.ok) {
    const lineError = Object.entries(v.fieldErrors).find(([k]) => k.startsWith('lines'));
    return {
      fieldErrors: { ...v.fieldErrors, ...(lineError ? { form: `${lineError[0]}: ${lineError[1]}` } : {}) },
      values,
    };
  }
  let journalId = '';
  const failed = await mutate(locale, values, async (api) => {
    const j = unwrap(
      await api.POST('/api/v1/companies/{companyId}/journals', {
        params: { path: { companyId }, header: { 'Idempotency-Key': key } },
        body: v.data,
      }),
    );
    journalId = j.id;
  });
  if (failed) return failed;
  redirect(`/${locale}/c/${companyId}/journals/${journalId}`);
}

export async function reverseJournalAction(
  localeRaw: string,
  companyId: string,
  journalId: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const locale = resolveLocale(localeRaw);
  const values = formValues(form);
  const v = validate(reverseJournalSchema, { postingDate: values.postingDate, reason: values.reason });
  if (!v.ok) return { fieldErrors: v.fieldErrors, values };
  let reversalId = '';
  const failed = await mutate(locale, values, async (api) => {
    const j = unwrap(
      await api.POST('/api/v1/companies/{companyId}/journals/{journalId}/reverse', {
        params: {
          path: { companyId, journalId },
          header: { 'Idempotency-Key': values.idempotencyKey ?? randomUUID() },
        },
        body: v.data,
      }),
    );
    reversalId = j.id;
  });
  if (failed) return failed;
  redirect(`/${locale}/c/${companyId}/journals/${reversalId}`);
}
