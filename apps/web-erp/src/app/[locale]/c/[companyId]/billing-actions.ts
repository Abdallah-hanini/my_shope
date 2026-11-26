'use server';

import { unwrap } from '@erp/api-client';
import { resolveLocale } from '@erp/localization';
import {
  createInvoiceSchema,
  creditNoteSchema,
  postingSettingsSchema,
  recordPaymentSchema,
  releaseUnpaidSchema,
} from '@erp/validation';
import { redirect } from 'next/navigation';
import { formValues, mutate, validate } from '@/lib/actions';
import type { FormState } from '@/lib/form-state';

// Invoices, payments, credit notes, unpaid release and posting accounts (T-72). The API posts to
// the ledger and checks every rule; these pass the input.

export type BillingOp =
  | { kind: 'invoice'; quoteId: string }
  | { kind: 'pay'; invoiceId: string }
  | { kind: 'credit'; invoiceId: string }
  | { kind: 'release' };

export async function billingAction(
  localeRaw: string,
  companyId: string,
  jobId: string,
  op: BillingOp,
  _p: FormState,
  form: FormData,
): Promise<FormState> {
  const locale = resolveLocale(localeRaw);
  const values = formValues(form);
  const failed = await (async () => {
    if (op.kind === 'invoice') {
      const v = validate(createInvoiceSchema, { quoteId: op.quoteId });
      if (!v.ok) return { fieldErrors: v.fieldErrors, values };
      return mutate(locale, values, async (api) => {
        unwrap(
          await api.POST('/api/v1/companies/{companyId}/jobs/{jobId}/invoices', {
            params: { path: { companyId, jobId } },
            body: v.data,
          }),
        );
      });
    }
    if (op.kind === 'pay') {
      const v = validate(recordPaymentSchema, {
        method: values.method,
        amount: values.amount ?? '',
        reference: values.reference,
        idempotencyKey: values.idempotencyKey,
      });
      if (!v.ok) return { fieldErrors: v.fieldErrors, values };
      return mutate(locale, values, async (api) => {
        unwrap(
          await api.POST('/api/v1/companies/{companyId}/invoices/{invoiceId}/payments', {
            params: { path: { companyId, invoiceId: op.invoiceId } },
            body: v.data,
          }),
        );
      });
    }
    if (op.kind === 'credit') {
      const v = validate(creditNoteSchema, { reason: values.reason ?? '' });
      if (!v.ok) return { fieldErrors: v.fieldErrors, values };
      return mutate(locale, values, async (api) => {
        unwrap(
          await api.POST('/api/v1/companies/{companyId}/invoices/{invoiceId}/credit-note', {
            params: { path: { companyId, invoiceId: op.invoiceId } },
            body: v.data,
          }),
        );
      });
    }
    const v = validate(releaseUnpaidSchema, { version: Number(values.version), reason: values.reason ?? '' });
    if (!v.ok) return { fieldErrors: v.fieldErrors, values };
    return mutate(locale, values, async (api) => {
      unwrap(
        await api.POST('/api/v1/companies/{companyId}/jobs/{jobId}/release-unpaid', {
          params: { path: { companyId, jobId } },
          body: v.data,
        }),
      );
    });
  })();
  if (failed) return failed;
  redirect(`/${locale}/c/${companyId}/jobs/${jobId}#billing-title`);
}

export async function postingSettingsAction(
  localeRaw: string,
  companyId: string,
  _p: FormState,
  form: FormData,
): Promise<FormState> {
  const locale = resolveLocale(localeRaw);
  const values = formValues(form);
  const id = (k: string) => (values[k] ? values[k] : null);
  const v = validate(postingSettingsSchema, {
    version: Number(values.version),
    labourRevenueAccountId: id('labourRevenueAccountId'),
    receivableAccountId: id('receivableAccountId'),
    cashAccountId: id('cashAccountId'),
    cardAccountId: id('cardAccountId'),
    bankAccountId: id('bankAccountId'),
    inventoryAccountId: id('inventoryAccountId'),
    goodsReceivedAccountId: id('goodsReceivedAccountId'),
    stockAdjustmentAccountId: id('stockAdjustmentAccountId'),
    cogsAccountId: id('cogsAccountId'),
    partsRevenueAccountId: id('partsRevenueAccountId'),
    payablesAccountId: id('payablesAccountId'),
    inputTaxAccountId: id('inputTaxAccountId'),
    priceVarianceAccountId: id('priceVarianceAccountId'),
    transitAccountId: id('transitAccountId'),
  });
  if (!v.ok) return { fieldErrors: v.fieldErrors, values };
  const failed = await mutate(locale, values, async (api) => {
    unwrap(
      await api.PUT('/api/v1/companies/{companyId}/posting-settings', {
        params: { path: { companyId } },
        body: v.data,
      }),
    );
  });
  if (failed) return failed;
  redirect(`/${locale}/c/${companyId}/settings/posting`);
}
