'use client';

import { createTranslator, type Locale, type MessageKey } from '@erp/localization';
import type { ExportKind } from '@erp/validation';
import { useActionState, useState, type ReactNode } from 'react';
import type { FormState } from '@/lib/form-state';
import { FormError, SubmitButton } from '../forms';
import { buttonSecondary, Field, inputClass } from '../ui';

type Kind = ExportKind;

/**
 * Two layouts: "compact" sits on a report page and exports exactly what is on screen (hidden
 * fields carry the filters); "full" is the export centre's own form.
 */
export function ExportForm({
  locale,
  action,
  kinds,
  initial,
  accounts = [],
  branches = [],
  compact = false,
  children,
}: {
  locale: Locale;
  action: (state: FormState, form: FormData) => Promise<FormState>;
  kinds: Kind[];
  initial: {
    kind: Kind;
    /** Omitted for as-of reports (balance sheet, aging). */
    from?: string;
    to: string;
    compare?: 'none' | 'previous';
    branchId?: string;
    accountId?: string;
    includeZero?: boolean;
  };
  accounts?: { id: string; label: string }[];
  branches?: { id: string; label: string }[];
  compact?: boolean;
  /** Compact only: extra controls on the same row as the button (e.g. print). */
  children?: ReactNode;
}) {
  const t = createTranslator(locale);
  const [state, formAction] = useActionState(action, {} as FormState);
  const v = state.values ?? {};
  const err = state.fieldErrors ?? {};
  const [kind, setKind] = useState<Kind>((v.kind as Kind) ?? initial.kind);
  const formats = (
    <Field id={`${compact ? 'x' : 'e'}-format`} label={t('export.format')} error={err.format}>
      <select
        id={`${compact ? 'x' : 'e'}-format`}
        name="format"
        defaultValue={v.format ?? 'xlsx'}
        className={inputClass}
      >
        <option value="xlsx">{t('export.format.xlsx')}</option>
        <option value="csv">{t('export.format.csv')}</option>
      </select>
    </Field>
  );

  if (compact) {
    const compactError = state.error ?? err.form ?? err.to ?? err.accountId;
    return (
      <form
        action={formAction}
        className="flex flex-wrap items-end gap-3 print:hidden"
        aria-label={t('export.exportAs')}
      >
        <input type="hidden" name="kind" value={initial.kind} />
        {initial.from ? <input type="hidden" name="from" value={initial.from} /> : null}
        {initial.compare ? <input type="hidden" name="compare" value={initial.compare} /> : null}
        <input type="hidden" name="to" value={initial.to} />
        <input type="hidden" name="fileLocale" value={locale} />
        {initial.branchId ? <input type="hidden" name="branchId" value={initial.branchId} /> : null}
        {initial.accountId ? <input type="hidden" name="accountId" value={initial.accountId} /> : null}
        {initial.includeZero ? <input type="hidden" name="includeZero" value="1" /> : null}
        <div className="w-48">{formats}</div>
        <SubmitButton label={t('export.exportAs')} locale={locale} className={buttonSecondary} />
        {children}
        {/* Only when there is a message: an empty full-width row would add a gap under the buttons. */}
        {compactError ? (
          <div className="basis-full">
            <FormError message={compactError} />
          </div>
        ) : null}
      </form>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormError message={state.error ?? err.form} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field id="e-kind" label={t('export.kind')} error={err.kind}>
          <select
            id="e-kind"
            name="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as Kind)}
            className={inputClass}
          >
            {kinds.map((k) => (
              <option key={k} value={k}>
                {t(`export.kind.${k}` as MessageKey)}
              </option>
            ))}
          </select>
        </Field>
        <Field id="e-from" label={t('ledger.from')} error={err.from}>
          <input
            id="e-from"
            name="from"
            type="date"
            required
            dir="ltr"
            defaultValue={v.from ?? initial.from ?? ''}
            className={inputClass}
          />
        </Field>
        <Field id="e-to" label={t('ledger.to')} error={err.to}>
          <input
            id="e-to"
            name="to"
            type="date"
            required
            dir="ltr"
            defaultValue={v.to ?? initial.to}
            className={inputClass}
          />
        </Field>
        {branches.length ? (
          <Field id="e-branch" label={t('common.branch')} error={err.branchId}>
            <select id="e-branch" name="branchId" defaultValue={v.branchId ?? ''} className={inputClass}>
              <option value="">{t('dash.allBranches')}</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        {kind === 'general_ledger' ? (
          <Field
            id="e-account"
            label={t('ledger.account')}
            error={err.accountId ? t('export.accountRequired') : undefined}
          >
            <select id="e-account" name="accountId" defaultValue={v.accountId ?? ''} className={inputClass}>
              <option value="">{t('ledger.chooseAccount')}</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        {formats}
        <Field id="e-lang" label={t('export.language')}>
          <select id="e-lang" name="fileLocale" defaultValue={v.fileLocale ?? locale} className={inputClass}>
            <option value="en">English</option>
            <option value="ar">العربية</option>
          </select>
        </Field>
      </div>
      {kind === 'trial_balance' ? (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="includeZero"
            value="1"
            defaultChecked={v.includeZero === '1'}
            className="size-4"
          />
          {t('ledger.includeZero')}
        </label>
      ) : null}
      <div>
        <SubmitButton label={t('export.request')} locale={locale} />
      </div>
    </form>
  );
}
