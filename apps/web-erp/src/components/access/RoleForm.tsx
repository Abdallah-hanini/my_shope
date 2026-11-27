'use client';

import { createTranslator, type Locale, type MessageKey } from '@erp/localization';
import { PERMISSION_GROUPS } from '@erp/validation';
import { useActionState } from 'react';
import type { FormState } from '@/lib/form-state';
import { FormError, SubmitButton } from '../forms';
import { Field, inputClass } from '../ui';

/** Role editor: grouped permission checkboxes. Disabled entirely for system roles. */
export function RoleForm({
  locale,
  action,
  initial,
  mode,
  readOnly = false,
}: {
  locale: Locale;
  action: (state: FormState, form: FormData) => Promise<FormState>;
  initial?: { code: string; name: string; nameAr: string | null; permissions: string[]; version: number };
  mode: 'create' | 'edit';
  readOnly?: boolean;
}) {
  const t = createTranslator(locale);
  const [state, formAction] = useActionState(action, {} as FormState);
  const err = state.fieldErrors ?? {};
  const v = state.values ?? {};
  const selected = new Set(
    v.permissions !== undefined ? v.permissions.split(',') : (initial?.permissions ?? []),
  );
  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <FormError message={state.error ?? err.form ?? err.permissions} />
      {initial ? <input type="hidden" name="version" value={initial.version} /> : null}
      <fieldset disabled={readOnly} className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {mode === 'create' ? (
            <Field id="role-code" label={t('common.code')} error={err.code}>
              <input
                id="role-code"
                name="code"
                dir="ltr"
                required
                defaultValue={v.code ?? ''}
                className={inputClass}
                aria-invalid={err.code ? true : undefined}
              />
            </Field>
          ) : null}
          <Field id="role-name" label={t('common.name')} error={err.name}>
            <input
              id="role-name"
              name="name"
              required
              defaultValue={v.name ?? initial?.name ?? ''}
              className={inputClass}
              aria-invalid={err.name ? true : undefined}
            />
          </Field>
          <Field
            id="role-nameAr"
            label={`${t('common.nameAr')} (${t('common.optional')})`}
            error={err.nameAr}
          >
            <input
              id="role-nameAr"
              name="nameAr"
              dir="rtl"
              defaultValue={v.nameAr ?? initial?.nameAr ?? ''}
              className={inputClass}
            />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {PERMISSION_GROUPS.map((g) => (
            <fieldset
              key={g.id}
              className="rounded-[var(--radius-card)] border border-[var(--color-border)] p-4"
            >
              <legend className="px-1 text-sm font-semibold">{t(`perm.group.${g.id}` as MessageKey)}</legend>
              <ul className="mt-1 flex flex-col gap-2">
                {g.permissions.map((p) => (
                  <li key={p}>
                    <label className="flex min-h-8 items-start gap-3 text-sm">
                      <input
                        type="checkbox"
                        name="permissions"
                        value={p}
                        defaultChecked={selected.has(p)}
                        className="mt-0.5 size-4"
                      />
                      <span>
                        {t(`perm.${p}` as MessageKey)}
                        <code dir="ltr" className="ms-2 text-xs text-[var(--color-text-muted)]">
                          {p}
                        </code>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
          ))}
        </div>
        <p className="text-xs text-[var(--color-text-muted)]">{t('roles.escalationNote')}</p>
        {readOnly ? null : (
          <div>
            <SubmitButton label={mode === 'create' ? t('roles.new') : t('roles.save')} locale={locale} />
          </div>
        )}
      </fieldset>
    </form>
  );
}
