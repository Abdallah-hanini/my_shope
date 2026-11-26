'use server';

import { unwrap } from '@erp/api-client';
import { createTranslator, resolveLocale } from '@erp/localization';
import {
  addLabourRateSchema,
  addTaxRateSchema,
  companyProfileSchema,
  createTaxCodeSchema,
  LOGO_LIMITS,
  pricingSettingsSchema,
  taxSettingsSchema,
  updateTaxCodeSchema,
} from '@erp/validation';
import { redirect } from 'next/navigation';
import { formValues, mutate, validate } from '@/lib/actions';
import { webConfig } from '@/lib/config';
import type { FormState } from '@/lib/form-state';
import { sessionForAction } from '@/lib/session';

// Settings for pricing (D-05): tax (accountant), labour rates and discount limit (owner),
// letterhead (administrator). The API decides who may change what.

const blank = (v: string | undefined) => (v && v.trim() ? v.trim() : null);

export async function taxStepAction(
  localeRaw: string,
  companyId: string,
  op:
    | { kind: 'settings' }
    | { kind: 'createCode' }
    | { kind: 'updateCode'; id: string }
    | { kind: 'addRate'; id: string }
    | { kind: 'removeRate'; id: string; rateId: string },
  _p: FormState,
  form: FormData,
): Promise<FormState> {
  const locale = resolveLocale(localeRaw);
  const values = formValues(form);
  const path = { companyId };
  const failed = await (async () => {
    if (op.kind === 'settings') {
      const v = validate(taxSettingsSchema, {
        version: Number(values.version),
        pricesIncludeTax: values.pricesIncludeTax === 'true',
        defaultTaxCodeId: blank(values.defaultTaxCodeId),
        taxRegistrationNo: values.taxRegistrationNo,
      });
      if (!v.ok) return { fieldErrors: v.fieldErrors, values };
      return mutate(locale, values, async (api) => {
        unwrap(
          await api.PUT('/api/v1/companies/{companyId}/tax/settings', { params: { path }, body: v.data }),
        );
      });
    }
    if (op.kind === 'createCode') {
      const v = validate(createTaxCodeSchema, {
        code: values.code ?? '',
        name: values.name,
        nameAr: values.nameAr,
        outputAccountId: blank(values.outputAccountId),
      });
      if (!v.ok) return { fieldErrors: v.fieldErrors, values };
      return mutate(locale, values, async (api) => {
        unwrap(await api.POST('/api/v1/companies/{companyId}/tax/codes', { params: { path }, body: v.data }));
      });
    }
    if (op.kind === 'updateCode') {
      const v = validate(updateTaxCodeSchema, {
        version: Number(values.version),
        name: values.name,
        nameAr: values.nameAr,
        outputAccountId: blank(values.outputAccountId),
        active: values.active === 'true',
      });
      if (!v.ok) return { fieldErrors: v.fieldErrors, values };
      return mutate(locale, values, async (api) => {
        unwrap(
          await api.PATCH('/api/v1/companies/{companyId}/tax/codes/{taxCodeId}', {
            params: { path: { ...path, taxCodeId: op.id } },
            body: v.data,
          }),
        );
      });
    }
    if (op.kind === 'addRate') {
      const v = validate(addTaxRateSchema, {
        rate: values.rate ?? '',
        effectiveFrom: values.effectiveFrom ?? '',
      });
      if (!v.ok) return { fieldErrors: v.fieldErrors, values };
      return mutate(locale, values, async (api) => {
        unwrap(
          await api.POST('/api/v1/companies/{companyId}/tax/codes/{taxCodeId}/rates', {
            params: { path: { ...path, taxCodeId: op.id } },
            body: v.data,
          }),
        );
      });
    }
    return mutate(locale, values, async (api) => {
      unwrap(
        await api.DELETE('/api/v1/companies/{companyId}/tax/codes/{taxCodeId}/rates/{rateId}', {
          params: { path: { ...path, taxCodeId: op.id, rateId: op.rateId } },
        }),
      );
    });
  })();
  if (failed) return failed;
  redirect(`/${locale}/c/${companyId}/settings/tax`);
}

export async function pricingStepAction(
  localeRaw: string,
  companyId: string,
  op: { kind: 'settings' } | { kind: 'addRate'; branchId: string } | { kind: 'removeRate'; rateId: string },
  _p: FormState,
  form: FormData,
): Promise<FormState> {
  const locale = resolveLocale(localeRaw);
  const values = formValues(form);
  const failed = await (async () => {
    if (op.kind === 'settings') {
      const v = validate(pricingSettingsSchema, {
        version: Number(values.version),
        managerDiscountLimitPct: values.managerDiscountLimitPct ?? '',
      });
      if (!v.ok) return { fieldErrors: v.fieldErrors, values };
      return mutate(locale, values, async (api) => {
        unwrap(
          await api.PUT('/api/v1/companies/{companyId}/pricing/settings', {
            params: { path: { companyId } },
            body: v.data,
          }),
        );
      });
    }
    if (op.kind === 'addRate') {
      const v = validate(addLabourRateSchema, {
        rate: values.rate ?? '',
        effectiveFrom: values.effectiveFrom ?? '',
      });
      if (!v.ok) return { fieldErrors: v.fieldErrors, values };
      return mutate(locale, values, async (api) => {
        unwrap(
          await api.POST('/api/v1/companies/{companyId}/branches/{branchId}/labour-rates', {
            params: { path: { companyId, branchId: op.branchId } },
            body: v.data,
          }),
        );
      });
    }
    return mutate(locale, values, async (api) => {
      unwrap(
        await api.DELETE('/api/v1/companies/{companyId}/labour-rates/{rateId}', {
          params: { path: { companyId, rateId: op.rateId } },
        }),
      );
    });
  })();
  if (failed) return failed;
  redirect(`/${locale}/c/${companyId}/settings/pricing`);
}

export async function profileAction(
  localeRaw: string,
  companyId: string,
  _p: FormState,
  form: FormData,
): Promise<FormState> {
  const locale = resolveLocale(localeRaw);
  const values = formValues(form);
  const v = validate(companyProfileSchema, {
    version: Number(values.version),
    crNumber: values.crNumber,
    address: values.address,
    addressAr: values.addressAr,
    phone: values.phone,
  });
  if (!v.ok) return { fieldErrors: v.fieldErrors, values };
  const failed = await mutate(locale, values, async (api) => {
    unwrap(
      await api.PUT('/api/v1/companies/{companyId}/profile', {
        params: { path: { companyId } },
        body: v.data,
      }),
    );
  });
  if (failed) return failed;
  redirect(`/${locale}/c/${companyId}/settings/company`);
}

/** Upload (file present) or remove (op 'remove') the logo. */
export async function logoAction(
  localeRaw: string,
  companyId: string,
  op: 'upload' | 'remove',
  _p: FormState,
  form: FormData,
): Promise<FormState> {
  const locale = resolveLocale(localeRaw);
  const t = createTranslator(locale);
  const session = await sessionForAction();
  if (!session) return { error: t('error.sessionEnded') };
  const url = `${webConfig().API_INTERNAL_URL}/api/v1/companies/${companyId}/profile/logo`;
  let res: Response;
  if (op === 'upload') {
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0 || file.size > LOGO_LIMITS.maxBytes)
      return { fieldErrors: { file: t('settings.logoHelp') } };
    const body = new FormData();
    body.set('file', file, file.name);
    try {
      res = await fetch(url, {
        method: 'PUT',
        headers: { authorization: `Bearer ${session.accessToken}` },
        body,
        cache: 'no-store',
      });
    } catch {
      return { error: t('error.network') };
    }
  } else {
    try {
      res = await fetch(url, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${session.accessToken}` },
        cache: 'no-store',
      });
    } catch {
      return { error: t('error.network') };
    }
  }
  if (!res.ok) {
    if (res.status === 403) return { error: t('error.forbidden') };
    const problem = (await res.json().catch(() => null)) as { detail?: string; title?: string } | null;
    return { error: problem?.detail ?? problem?.title ?? t('error.title') };
  }
  redirect(`/${locale}/c/${companyId}/settings/company`);
}
