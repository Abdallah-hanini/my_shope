'use client';

import { createTranslator, type Locale } from '@erp/localization';
import Link from 'next/link';
import { useActionState } from 'react';
import type { FormState } from '@/lib/form-state';
import { FormError, SubmitButton } from '../forms';
import { Field, inputClass } from '../ui';
import { SecretOnce } from './SecretOnce';

export function StaffForm({
  locale,
  action,
  roles,
  branches,
  allowCompanyWide,
  usersHref,
}: {
  locale: Locale;
  action: (state: FormState, form: FormData) => Promise<FormState>;
  roles: { id: string; label: string }[];
  branches: { id: string; label: string }[];
  allowCompanyWide: boolean;
  usersHref: string;
}) {
  const t = createTranslator(locale);
  const [state, formAction] = useActionState(action, {} as FormState);
  const err = state.fieldErrors ?? {};
  const v = state.values ?? {};
  const field = (
    name: string,
    label: string,
    opts: { type?: string; dir?: 'ltr' | 'rtl'; hint?: string; autoComplete?: string } = {},
  ) => (
    <Field id={`staff-${name}`} label={label} error={err[name]} hint={opts.hint}>
      <input
        id={`staff-${name}`}
        name={name}
        type={opts.type ?? 'text'}
        dir={opts.dir}
        defaultValue={state.result ? '' : (v[name] ?? '')}
        autoComplete={opts.autoComplete ?? 'off'}
        required
        aria-invalid={err[name] ? true : undefined}
        className={inputClass}
      />
    </Field>
  );
  return (
    <div className="flex flex-col gap-4">
      {state.result?.temporaryPassword ? (
        <SecretOnce
          locale={locale}
          title={`${t('users.created')}: ${state.result.name}`}
          secret={state.result.temporaryPassword}
        >
          <p className="mt-1 text-sm">
            {t('users.username')}: <code dir="ltr">{state.result.username}</code> ·{' '}
            <Link
              className="font-medium text-[var(--color-primary)] underline"
              href={`${usersHref}/${state.result.userId}`}
            >
              {t('users.openProfile')}
            </Link>
          </p>
        </SecretOnce>
      ) : null}
      <form
        action={formAction}
        className="flex flex-col gap-4"
        noValidate
        key={state.result?.userId ?? 'form'}
      >
        <FormError message={state.error ?? err.form} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {field('firstName', t('users.firstName'), { autoComplete: 'off' })}
          {field('lastName', t('users.lastName'))}
          {field('username', t('users.username'), { dir: 'ltr', hint: t('users.usernameHelp') })}
          {field('email', t('users.email'), { type: 'email', dir: 'ltr' })}
          <Field id="staff-roleId" label={t('users.role')} error={err.roleId}>
            <select
              id="staff-roleId"
              name="roleId"
              required
              defaultValue={v.roleId ?? ''}
              className={inputClass}
            >
              <option value="" disabled>
                —
              </option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </Field>
          <Field id="staff-branchId" label={t('users.branch')} error={err.branchId}>
            <select
              id="staff-branchId"
              name="branchId"
              defaultValue={v.branchId ?? ''}
              className={inputClass}
            >
              {allowCompanyWide ? <option value="">{t('common.allBranches')}</option> : null}
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
          </Field>
          <Field id="staff-locale" label={t('users.language')}>
            <select id="staff-locale" name="locale" defaultValue={v.locale ?? locale} className={inputClass}>
              <option value="en">English</option>
              <option value="ar">العربية</option>
            </select>
          </Field>
        </div>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="requireOtp"
            defaultChecked={v.requireOtp !== 'off'}
            className="mt-1 size-4"
          />
          <span>
            <span className="font-medium">{t('users.requireOtp')}</span>
            <span className="block text-xs text-[var(--color-text-muted)]">{t('users.requireOtpHelp')}</span>
          </span>
        </label>
        <div>
          <SubmitButton label={t('users.add')} locale={locale} />
        </div>
      </form>
    </div>
  );
}
