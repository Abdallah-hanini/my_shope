'use client';

import { createTranslator, type Locale } from '@erp/localization';
import { useActionState } from 'react';
import type { FormState } from '@/lib/form-state';
import { FormError, SubmitButton } from './forms';
import { Field, inputClass } from './ui';

export interface FieldSpec {
  name: string;
  label: string;
  type?: 'text' | 'date' | 'select' | 'textarea' | 'number' | 'datetime-local' | 'email' | 'tel';
  required?: boolean;
  hint?: string;
  defaultValue?: string;
  options?: { value: string; label: string }[];
  maxLength?: number;
  dir?: 'ltr' | 'rtl' | 'auto';
  autoComplete?: string;
}

/**
 * Generic accessible form bound to a server action. Errors from the server (field or form level)
 * are shown next to the fields; submitted values are kept after an error.
 */
export function SimpleForm({
  action,
  fields,
  hidden = {},
  submitLabel,
  locale,
  idPrefix,
  columns = 2,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  fields: FieldSpec[];
  hidden?: Record<string, string>;
  submitLabel: string;
  locale: Locale;
  idPrefix: string;
  columns?: 1 | 2 | 3;
}) {
  const [state, formAction] = useActionState(action, {} as FormState);
  const t = createTranslator(locale);
  const grid = { 1: 'sm:grid-cols-1', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3' }[columns];
  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormError message={state.error ?? state.fieldErrors?.form} />
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <div className={`grid grid-cols-1 gap-4 ${grid}`}>
        {fields.map((f) => {
          const id = `${idPrefix}-${f.name}`;
          const error = state.fieldErrors?.[f.name];
          const value = state.values?.[f.name] ?? f.defaultValue ?? '';
          const describedBy =
            [f.hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;
          const common = {
            id,
            name: f.name,
            required: f.required,
            'aria-invalid': error ? true : undefined,
            'aria-describedby': describedBy,
            className: inputClass,
            defaultValue: value,
            dir: f.dir,
          } as const;
          const label = f.required ? f.label : `${f.label} (${t('common.optional')})`;
          return (
            <Field key={`${f.name}-${value}`} id={id} label={label} error={error} hint={f.hint}>
              {f.type === 'select' ? (
                <select {...common}>
                  {f.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : f.type === 'textarea' ? (
                <textarea {...common} rows={3} maxLength={f.maxLength} />
              ) : (
                <input
                  {...common}
                  type={f.type ?? 'text'}
                  maxLength={f.maxLength}
                  autoComplete={f.autoComplete ?? 'off'}
                />
              )}
            </Field>
          );
        })}
      </div>
      <div>
        <SubmitButton label={submitLabel} locale={locale} />
      </div>
    </form>
  );
}
