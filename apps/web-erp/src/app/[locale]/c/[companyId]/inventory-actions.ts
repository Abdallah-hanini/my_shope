'use server';

import { unwrap } from '@erp/api-client';
import { resolveLocale } from '@erp/localization';
import {
  addJobPartSchema,
  adjustStockSchema,
  cancelOrderSchema,
  cancelTransferSchema,
  createTransferSchema,
  createPartSchema,
  jobPartStepSchema,
  orderJobPartSchema,
  partPriceSchema,
  receiveStockSchema,
  reorderLevelSchema,
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
  | { kind: 'adjust'; branchId: string }
  | { kind: 'reorder' | 'reorderRemove'; branchId: string };

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
    if (op.kind === 'reorder' || op.kind === 'reorderRemove') {
      const levelPath = { params: { path: { companyId, partId, branchId: op.branchId } } };
      if (op.kind === 'reorderRemove')
        return mutate(locale, values, async (api) => {
          unwrap(
            await api.DELETE(
              '/api/v1/companies/{companyId}/parts/{partId}/reorder-levels/{branchId}',
              levelPath,
            ),
          );
        });
      const v = validate(reorderLevelSchema, {
        minQuantity: values.minQuantity ?? '',
        reorderQuantity: values.reorderQuantity ?? '',
        version: values.version ? Number(values.version) : undefined,
      });
      if (!v.ok) return { fieldErrors: v.fieldErrors, values };
      return mutate(locale, values, async (api) => {
        unwrap(
          await api.PUT('/api/v1/companies/{companyId}/parts/{partId}/reorder-levels/{branchId}', {
            ...levelPath,
            body: v.data,
          }),
        );
      });
    }
    if (op.kind === 'receive') {
      const v = validate(receiveStockSchema, {
        branchId: op.branchId,
        supplierId: values.supplierId ? values.supplierId : null,
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

export type JobPartOp =
  | { kind: 'add' }
  | { kind: 'order' }
  | { kind: 'release' | 'issue' | 'return' | 'allocate' | 'cancelOrder'; jobPartId: string };

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
    if (op.kind === 'order') {
      const v = validate(orderJobPartSchema, {
        partId: values.partId,
        quantity: values.quantity ?? '',
        supplierId: values.supplierId ? values.supplierId : null,
        orderRef: values.orderRef,
      });
      if (!v.ok) return { fieldErrors: v.fieldErrors, values };
      return mutate(locale, values, async (api) => {
        unwrap(
          await api.POST('/api/v1/companies/{companyId}/jobs/{jobId}/parts/order', {
            params: { path: { companyId, jobId } },
            body: v.data,
          }),
        );
      });
    }
    const path = { params: { path: { companyId, jobPartId: op.jobPartId } } };
    if (op.kind === 'allocate')
      return mutate(locale, values, async (api) => {
        unwrap(await api.POST('/api/v1/companies/{companyId}/job-parts/{jobPartId}/allocate', path));
      });
    if (op.kind === 'cancelOrder') {
      const v = validate(cancelOrderSchema, { reason: values.reason ?? '' });
      if (!v.ok) return { fieldErrors: v.fieldErrors, values };
      return mutate(locale, values, async (api) => {
        unwrap(
          await api.POST('/api/v1/companies/{companyId}/job-parts/{jobPartId}/cancel-order', {
            ...path,
            body: v.data,
          }),
        );
      });
    }
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

/** Send stock to another branch (T-78): up to 5 rows of part and quantity; empty rows are skipped. */
export async function sendTransferAction(
  localeRaw: string,
  companyId: string,
  fromBranchId: string,
  _p: FormState,
  form: FormData,
): Promise<FormState> {
  const locale = resolveLocale(localeRaw);
  const values = formValues(form);
  const lines = [0, 1, 2, 3, 4]
    .map((i) => ({ partId: values[`part${i}`] ?? '', quantity: values[`quantity${i}`]?.trim() ?? '' }))
    .filter((l) => l.partId && l.quantity);
  const v = validate(createTransferSchema, {
    fromBranchId,
    toBranchId: values.toBranchId,
    lines,
    note: values.note,
    idempotencyKey: values.idempotencyKey,
  });
  if (!v.ok) return { fieldErrors: v.fieldErrors, values };
  let id = '';
  const failed = await mutate(locale, values, async (api) => {
    id = unwrap(
      await api.POST('/api/v1/companies/{companyId}/transfers', {
        params: { path: { companyId } },
        body: v.data,
      }),
    ).id;
  });
  if (failed) return failed;
  redirect(`/${locale}/c/${companyId}/transfers/${id}`);
}

export async function transferAction(
  localeRaw: string,
  companyId: string,
  transferId: string,
  op: 'receive' | 'cancel',
  _p: FormState,
  form: FormData,
): Promise<FormState> {
  const locale = resolveLocale(localeRaw);
  const values = formValues(form);
  const path = { params: { path: { companyId, transferId } } };
  const failed = await (async () => {
    if (op === 'receive')
      return mutate(locale, values, async (api) => {
        unwrap(await api.POST('/api/v1/companies/{companyId}/transfers/{transferId}/receive', path));
      });
    const v = validate(cancelTransferSchema, { reason: values.reason ?? '' });
    if (!v.ok) return { fieldErrors: v.fieldErrors, values };
    return mutate(locale, values, async (api) => {
      unwrap(
        await api.POST('/api/v1/companies/{companyId}/transfers/{transferId}/cancel', {
          ...path,
          body: v.data,
        }),
      );
    });
  })();
  if (failed) return failed;
  redirect(`/${locale}/c/${companyId}/transfers/${transferId}`);
}
