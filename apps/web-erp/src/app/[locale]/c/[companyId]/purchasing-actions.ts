'use server';

import { unwrap } from '@erp/api-client';
import { resolveLocale } from '@erp/localization';
import {
  cancelSupplierBillSchema,
  createSupplierBillSchema,
  createSupplierSchema,
  supplierPaymentSchema,
  updateSupplierSchema,
} from '@erp/validation';
import { redirect } from 'next/navigation';
import { formValues, mutate, validate } from '@/lib/actions';
import type { FormState } from '@/lib/form-state';

// Suppliers, supplier bills and payments (T-76). The API checks permissions, totals and posts.

const supplierFields = (values: Record<string, string>) => ({
  name: values.name ?? '',
  nameAr: values.nameAr,
  phone: values.phone,
  email: values.email,
  taxNumber: values.taxNumber,
  paymentTermsDays: values.paymentTermsDays?.trim() ? Number(values.paymentTermsDays) : 0,
});

export async function createSupplierAction(
  localeRaw: string,
  companyId: string,
  _p: FormState,
  form: FormData,
): Promise<FormState> {
  const locale = resolveLocale(localeRaw);
  const values = formValues(form);
  const v = validate(createSupplierSchema, supplierFields(values));
  if (!v.ok) return { fieldErrors: v.fieldErrors, values };
  let id = '';
  const failed = await mutate(locale, values, async (api) => {
    id = unwrap(
      await api.POST('/api/v1/companies/{companyId}/suppliers', {
        params: { path: { companyId } },
        body: v.data,
      }),
    ).id;
  });
  if (failed) return failed;
  redirect(`/${locale}/c/${companyId}/suppliers/${id}`);
}

export async function updateSupplierAction(
  localeRaw: string,
  companyId: string,
  supplierId: string,
  _p: FormState,
  form: FormData,
): Promise<FormState> {
  const locale = resolveLocale(localeRaw);
  const values = formValues(form);
  const v = validate(updateSupplierSchema, {
    ...supplierFields(values),
    version: Number(values.version),
    active: values.active === 'true',
  });
  if (!v.ok) return { fieldErrors: v.fieldErrors, values };
  const failed = await mutate(locale, values, async (api) => {
    unwrap(
      await api.PATCH('/api/v1/companies/{companyId}/suppliers/{supplierId}', {
        params: { path: { companyId, supplierId } },
        body: v.data,
      }),
    );
  });
  if (failed) return failed;
  redirect(`/${locale}/c/${companyId}/suppliers/${supplierId}`);
}

/** The bill form lists receipts as `pick:<id>` checkboxes with `amount:<id>` fields. */
export async function createSupplierBillAction(
  localeRaw: string,
  companyId: string,
  supplierId: string,
  branchId: string,
  _p: FormState,
  form: FormData,
): Promise<FormState> {
  const locale = resolveLocale(localeRaw);
  const values = formValues(form);
  const lines = Object.keys(values)
    .filter((k) => k.startsWith('pick:') && values[k] === 'on')
    .map((k) => {
      const movementId = k.slice(5);
      return { movementId, amount: values[`amount:${movementId}`]?.trim() ?? '' };
    });
  const v = validate(createSupplierBillSchema, {
    supplierId,
    branchId,
    supplierInvoiceNo: values.supplierInvoiceNo ?? '',
    billDate: values.billDate ?? '',
    taxCodeId: values.taxCodeId ? values.taxCodeId : null,
    lines,
    varianceReason: values.varianceReason,
    idempotencyKey: values.idempotencyKey,
  });
  if (!v.ok) return { fieldErrors: v.fieldErrors, values };
  let id = '';
  const failed = await mutate(locale, values, async (api) => {
    id = unwrap(
      await api.POST('/api/v1/companies/{companyId}/supplier-bills', {
        params: { path: { companyId } },
        body: v.data,
      }),
    ).id;
  });
  if (failed) return failed;
  redirect(`/${locale}/c/${companyId}/supplier-bills/${id}`);
}

export type BillOp = 'pay' | 'cancel';

export async function supplierBillAction(
  localeRaw: string,
  companyId: string,
  billId: string,
  op: BillOp,
  _p: FormState,
  form: FormData,
): Promise<FormState> {
  const locale = resolveLocale(localeRaw);
  const values = formValues(form);
  const path = { params: { path: { companyId, billId } } };
  const failed = await (async () => {
    if (op === 'pay') {
      const v = validate(supplierPaymentSchema, {
        method: values.method,
        amount: values.amount ?? '',
        reference: values.reference,
        idempotencyKey: values.idempotencyKey,
      });
      if (!v.ok) return { fieldErrors: v.fieldErrors, values };
      return mutate(locale, values, async (api) => {
        unwrap(
          await api.POST('/api/v1/companies/{companyId}/supplier-bills/{billId}/payments', {
            ...path,
            body: v.data,
          }),
        );
      });
    }
    const v = validate(cancelSupplierBillSchema, { reason: values.reason ?? '' });
    if (!v.ok) return { fieldErrors: v.fieldErrors, values };
    return mutate(locale, values, async (api) => {
      unwrap(
        await api.POST('/api/v1/companies/{companyId}/supplier-bills/{billId}/cancel', {
          ...path,
          body: v.data,
        }),
      );
    });
  })();
  if (failed) return failed;
  redirect(`/${locale}/c/${companyId}/supplier-bills/${billId}`);
}
