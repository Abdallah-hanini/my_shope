import 'server-only';
import { ApiProblemError } from '@erp/api-client';
import { createTranslator, type Locale } from '@erp/localization';
import type { ZodTypeAny, z } from 'zod';
import { apiFor, type Api } from './api';
import { sessionForAction } from './session';

import type { FormState } from './form-state';

export type { FormState };

export function formValues(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  form.forEach((v, k) => {
    if (typeof v === 'string' && !k.startsWith('$')) out[k] = v;
  });
  return out;
}

/** Client-side-of-server validation with the shared schemas; the API validates again. */
export function validate<S extends ZodTypeAny>(
  schema: S,
  input: unknown,
): { ok: true; data: z.infer<S> } | { ok: false; fieldErrors: Record<string, string> } {
  const r = schema.safeParse(input);
  if (r.success) return { ok: true, data: r.data };
  const fieldErrors: Record<string, string> = {};
  for (const issue of r.error.issues) {
    const key = issue.path.join('.') || 'form';
    fieldErrors[key] ??= issue.message;
  }
  return { ok: false, fieldErrors };
}

/**
 * Runs an API mutation for a server action. Returns a FormState error instead of throwing, so the
 * form shows the server's RFC 9457 detail. Call redirect() after this returns successfully.
 */
export async function mutate(
  locale: Locale,
  values: Record<string, string>,
  fn: (api: Api) => Promise<void>,
): Promise<FormState | null> {
  const t = createTranslator(locale);
  const session = await sessionForAction();
  if (!session) return { error: t('error.sessionEnded'), values };
  try {
    await fn(apiFor(session.accessToken));
    return null;
  } catch (err) {
    if (err instanceof ApiProblemError) {
      if (err.status === 403) return { error: t('error.forbidden'), values };
      return { error: err.problem?.detail ?? err.problem?.title ?? t('error.title'), values };
    }
    console.error('server action failed:', err instanceof Error ? err.message : err);
    return { error: t('error.network'), values };
  }
}
