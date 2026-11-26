'use client';

import { type Locale } from '@erp/localization';
import { useActionState } from 'react';
import type { FormState } from '@/lib/form-state';
import { FormError, SubmitButton } from '../forms';
import { SecretOnce } from './SecretOnce';

/** A single-button server action with inline error and optional one-time secret result. */
export function ActionButton({
  locale,
  action,
  label,
  className,
  secretTitle,
}: {
  locale: Locale;
  action: () => Promise<FormState>;
  label: string;
  className?: string;
  secretTitle?: string;
}) {
  const [state, formAction] = useActionState(async () => action(), {} as FormState);
  return (
    <div className="flex flex-col gap-3">
      {state.result?.temporaryPassword && secretTitle ? (
        <SecretOnce locale={locale} title={secretTitle} secret={state.result.temporaryPassword} />
      ) : null}
      <FormError message={state.error} />
      <form action={formAction}>
        <SubmitButton label={label} locale={locale} className={className} />
      </form>
    </div>
  );
}
