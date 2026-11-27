'use server';

import { unwrap } from '@erp/api-client';
import { resolveLocale } from '@erp/localization';
import { salesTargetSchema } from '@erp/validation';
import { redirect } from 'next/navigation';
import { formValues, mutate, validate } from '@/lib/actions';
import type { FormState } from '@/lib/form-state';

export type TargetOp = { kind: 'set'; back: string } | { kind: 'remove'; targetId: string; back: string };

/** Monthly sales targets (R3a). The API checks reports.targets.manage and the branch scope. */
export async function targetAction(
  localeRaw: string,
  companyId: string,
  op: TargetOp,
  _p: FormState,
  form: FormData,
): Promise<FormState> {
  const locale = resolveLocale(localeRaw);
  const values = formValues(form);
  const failed = await (async () => {
    if (op.kind === 'remove')
      return mutate(locale, values, async (api) => {
        unwrap(
          await api.DELETE('/api/v1/companies/{companyId}/sales-targets/{targetId}', {
            params: { path: { companyId, targetId: op.targetId } },
          }),
        );
      });
    const v = validate(salesTargetSchema, {
      month: values.month ?? '',
      branchId: values.branchId ? values.branchId : null,
      amount: values.amount ?? '',
      version: values.version ? Number(values.version) : undefined,
    });
    if (!v.ok) return { fieldErrors: v.fieldErrors, values };
    return mutate(locale, values, async (api) => {
      unwrap(
        await api.PUT('/api/v1/companies/{companyId}/sales-targets', {
          params: { path: { companyId } },
          body: v.data,
        }),
      );
    });
  })();
  if (failed) return failed;
  redirect(op.back);
}
