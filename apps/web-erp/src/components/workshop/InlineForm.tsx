'use client';

import { type Locale } from '@erp/localization';
import { useActionState, type ReactNode } from 'react';
import type { FormState } from '@/lib/form-state';
import { FormError, SubmitButton } from '../forms';

/** A small form bound to a server action, with the server's error shown next to it. */
export function InlineForm({
  action,
  locale,
  submitLabel,
  submitClassName,
  className = 'flex flex-wrap items-end gap-x-3 gap-y-3',
  ariaLabel,
  children,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  locale: Locale;
  submitLabel: string;
  submitClassName?: string;
  className?: string;
  ariaLabel?: string;
  children?: ReactNode;
}) {
  const [state, formAction] = useActionState(action, {} as FormState);
  const firstFieldError = state.fieldErrors ? Object.values(state.fieldErrors)[0] : undefined;
  return (
    <form action={formAction} className="flex flex-col gap-2" aria-label={ariaLabel}>
      <FormError message={state.error ?? firstFieldError} />
      <div className={className}>
        {children}
        <SubmitButton label={submitLabel} locale={locale} className={submitClassName} />
      </div>
    </form>
  );
}
