'use server';

import { unwrap } from '@erp/api-client';
import { resolveLocale } from '@erp/localization';
import { quoteDecisionSchema, quoteVersionSchema, updateQuoteSchema } from '@erp/validation';
import { redirect } from 'next/navigation';
import { formValues, mutate, validate } from '@/lib/actions';
import type { FormState } from '@/lib/form-state';

// Quotes (WMS-005). The API prices, checks permissions and the discount limit; these pass input.

export type QuoteOp =
  | { kind: 'create' }
  | { kind: 'update'; quoteId: string; taskIds: string[] }
  | { kind: 'approve-discount' | 'issue' | 'discard' | 'decision'; quoteId: string };

export async function quoteAction(
  localeRaw: string,
  companyId: string,
  jobId: string,
  op: QuoteOp,
  _p: FormState,
  form: FormData,
): Promise<FormState> {
  const locale = resolveLocale(localeRaw);
  const values = formValues(form);
  const version = Number(values.version);
  const failed = await (async () => {
    if (op.kind === 'create')
      return mutate(locale, values, async (api) => {
        unwrap(
          await api.POST('/api/v1/companies/{companyId}/jobs/{jobId}/quotes', {
            params: { path: { companyId, jobId } },
          }),
        );
      });
    const path = { params: { path: { companyId, quoteId: op.quoteId } } };
    if (op.kind === 'update') {
      const v = validate(updateQuoteSchema, {
        version,
        discountPct: values.discountPct?.trim() || '0',
        discountReason: values.discountReason,
        lines: op.taskIds.map((taskId) => ({
          taskId,
          overrideAmount: values[`override_${taskId}`]?.trim() || null,
          overrideReason: values[`reason_${taskId}`],
        })),
      });
      if (!v.ok) return { fieldErrors: v.fieldErrors, values };
      return mutate(locale, values, async (api) => {
        unwrap(await api.PATCH('/api/v1/companies/{companyId}/quotes/{quoteId}', { ...path, body: v.data }));
      });
    }
    if (op.kind === 'decision') {
      const v = validate(
        quoteDecisionSchema,
        values.decision === 'decline'
          ? { decision: 'decline', version, reason: values.reason }
          : {
              decision: 'approve',
              version,
              authorizedByName: values.authorizedByName,
              authorizedVia: values.authorizedVia,
            },
      );
      if (!v.ok) return { fieldErrors: v.fieldErrors, values };
      return mutate(locale, values, async (api) => {
        unwrap(
          await api.POST('/api/v1/companies/{companyId}/quotes/{quoteId}/decision', {
            ...path,
            body: v.data as never,
          }),
        );
      });
    }
    const v = validate(quoteVersionSchema, { version });
    if (!v.ok) return { fieldErrors: v.fieldErrors, values };
    return mutate(locale, values, async (api) => {
      const body = v.data;
      unwrap(
        op.kind === 'issue'
          ? await api.POST('/api/v1/companies/{companyId}/quotes/{quoteId}/issue', { ...path, body })
          : op.kind === 'discard'
            ? await api.POST('/api/v1/companies/{companyId}/quotes/{quoteId}/discard', { ...path, body })
            : await api.POST('/api/v1/companies/{companyId}/quotes/{quoteId}/approve-discount', {
                ...path,
                body,
              }),
      );
    });
  })();
  if (failed) return failed;
  redirect(`/${locale}/c/${companyId}/jobs/${jobId}#quote-title`);
}
