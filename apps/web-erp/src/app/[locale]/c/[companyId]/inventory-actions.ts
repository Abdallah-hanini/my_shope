'use server';

import { unwrap } from '@erp/api-client';
import { resolveLocale } from '@erp/localization';
import {
  addJobPartSchema,
  adjustStockSchema,
  createPartSchema,
  jobPartStepSchema,
  partPriceSchema,
  receiveStockSchema,
  updatePartSchema,
} from '@erp/validation';
import { redirect } from 'next/navigation';
import { formValues, mutate, validate } from '@/lib/actions';
import type { FormState } from '@/lib/form-state';

// Parts and stock (T-74). The API checks permissions, prices at weighted average and posts.

export async function createPartAction(
  localeRaw: string,
  companyId: string,
  _p: FormState,
  form: FormData,
): Promise<FormState> {
  const locale = resolveLocale(localeRaw);
  const values = formValues(form);
  const v = validate(createPartSchema, {
    sku: values.sku ?? '',
    name: values.name,
    nameAr: values.nameAr,
    brand: values.brand,
    unit: values.unit,
  });
  if (!v.ok) return { fieldErrors: v.fieldErrors, values };
  let id = '';
  const failed = await mutate(locale, values, async (api) => {
    id = unwrap(
      await api.POST('/api/v1/companies/{companyId}/parts', {
        params: { path: { companyId } },
        body: v.data,
      }),
    ).id;
  });
  if (failed) return failed;
  redirect(`/${locale}/c/${companyId}/parts/${id}`);
}

export type PartOp =
  | { kind: 'update' }
  | { kind: 'price' }
  | { kind: 'receive'; branchId: string }
  | { kind: 'adjust'; branchId: string };

export async function partAction(
  localeRaw: string,
  companyId: string,
  partId: string,
  op: PartOp,
  _p: FormState,
  form: FormData,
): Promise<FormState> {
  const locale = resolveLocale(localeRaw);
  const values = formValues(form);
  const path = { params: { path: { companyId, partId } } };
  const failed = await (async () => {
    if (op.kind === 'update') {
      const v = validate(updatePartSchema, {
        version: Number(values.version),
        name: values.name,
        nameAr: values.nameAr,
        brand: values.brand,
        active: values.active === 'true',
      });
      if (!v.ok) return { fieldErrors: v.fieldErrors, values };
      return mutate(locale, values, async (api) => {
        unwrap(await api.PATCH('/api/v1/companies/{companyId}/parts/{partId}', { ...path, body: v.data }));
      });
    }
    if (op.kind === 'price') {
      const v = validate(partPriceSchema, {
        version: Number(values.version),
        salePrice: values.salePrice?.trim() || null,
      });
      if (!v.ok) return { fieldErrors: v.fieldErrors, values };
      return mutate(locale, values, async (api) => {
        unwrap(
          await api.PUT('/api/v1/companies/{companyId}/parts/{partId}/price', { ...path, body: v.data }),
        );
      });
    }
    if (op.kind === 'receive') {
      const v = validate(receiveStockSchema, {
        branchId: op.branchId,
        quantity: values.quantity ?? '',
        unitCost: values.unitCost ?? '',
        reference: values.reference ?? '',
        idempotencyKey: values.idempotencyKey,
      });
      if (!v.ok) return { fieldErrors: v.fieldErrors, values };
      return mutate(locale, values, async (api) => {
        unwrap(
          await api.POST('/api/v1/companies/{companyId}/parts/{partId}/receipts', { ...path, body: v.data }),
        );
      });
    }
    const v = validate(adjustStockSchema, {
      branchId: op.branchId,
      direction: values.direction,
      quantity: values.quantity ?? '',
      unitCost: values.unitCost?.trim() || null,
      reason: values.reason ?? '',
      idempotencyKey: values.idempotencyKey,
    });
    if (!v.ok) return { fieldErrors: v.fieldErrors, values };
    return mutate(locale, values, async (api) => {
      unwrap(
        await api.POST('/api/v1/companies/{companyId}/parts/{partId}/adjustments', { ...path, body: v.data }),
      );
    });
  })();
  if (failed) return failed;
  redirect(`/${locale}/c/${companyId}/parts/${partId}`);
}

export type JobPartOp = { kind: 'add' } | { kind: 'release' | 'issue' | 'return'; jobPartId: string };

/** Parts on a job (T-75): reserve, release, issue, return. */
export async function jobPartAction(
  localeRaw: string,
  companyId: string,
  jobId: string,
  op: JobPartOp,
  _p: FormState,
  form: FormData,
): Promise<FormState> {
  const locale = resolveLocale(localeRaw);
  const values = formValues(form);
  const failed = await (async () => {
    if (op.kind === 'add') {
      const v = validate(addJobPartSchema, { partId: values.partId, quantity: values.quantity ?? '' });
      if (!v.ok) return { fieldErrors: v.fieldErrors, values };
      return mutate(locale, values, async (api) => {
        unwrap(
          await api.POST('/api/v1/companies/{companyId}/jobs/{jobId}/parts', {
            params: { path: { companyId, jobId } },
            body: v.data,
          }),
        );
      });
    }
    const path = { params: { path: { companyId, jobPartId: op.jobPartId } } };
    if (op.kind === 'release')
      return mutate(locale, values, async (api) => {
        unwrap(await api.POST('/api/v1/companies/{companyId}/job-parts/{jobPartId}/release', path));
      });
    const v = validate(jobPartStepSchema, { idempotencyKey: values.idempotencyKey });
    if (!v.ok) return { fieldErrors: v.fieldErrors, values };
    return mutate(locale, values, async (api) => {
      unwrap(
        op.kind === 'issue'
          ? await api.POST('/api/v1/companies/{companyId}/job-parts/{jobPartId}/issue', {
              ...path,
              body: v.data,
            })
          : await api.POST('/api/v1/companies/{companyId}/job-parts/{jobPartId}/return', {
              ...path,
              body: v.data,
            }),
      );
    });
  })();
  if (failed) return failed;
  redirect(`/${locale}/c/${companyId}/jobs/${jobId}#parts-title`);
}
