'use client';

import { createTranslator, groupDigits, type Locale } from '@erp/localization';
import { formatMinorUnits, MONEY_PATTERN, toMinorUnits } from '@erp/validation';
import { useActionState, useMemo, useState } from 'react';
import type { FormState } from '@/lib/form-state';
import { FormError, SubmitButton } from './forms';
import { buttonSecondary, Field, inputClass, Ltr } from './ui';

interface Line {
  key: number;
  accountId: string;
  debit: string;
  credit: string;
  description: string;
}

/** Exact running totals in integer minor units; invalid amounts are flagged, never guessed. */
function amount(value: string, scale: number): bigint | null {
  if (value.trim() === '') return 0n;
  if (!MONEY_PATTERN.test(value.trim())) return null;
  try {
    return toMinorUnits(value.trim(), scale);
  } catch {
    return null;
  }
}

export function JournalForm({
  action,
  locale,
  accounts,
  branches,
  allowCompanyLevel,
  currency,
  scale,
  idempotencyKey,
  defaultDate,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  locale: Locale;
  accounts: { id: string; label: string }[];
  branches: { id: string; label: string }[];
  allowCompanyLevel: boolean;
  currency: string;
  scale: number;
  idempotencyKey: string;
  defaultDate: string;
}) {
  const t = createTranslator(locale);
  const [state, formAction] = useActionState(action, {} as FormState);
  const [nextKey, setNextKey] = useState(3);
  const [lines, setLines] = useState<Line[]>([
    { key: 1, accountId: '', debit: '', credit: '', description: '' },
    { key: 2, accountId: '', debit: '', credit: '', description: '' },
  ]);

  const totals = useMemo(() => {
    let debit = 0n;
    let credit = 0n;
    let invalid = false;
    for (const l of lines) {
      const d = amount(l.debit, scale);
      const c = amount(l.credit, scale);
      if (d === null || c === null) invalid = true;
      debit += d ?? 0n;
      credit += c ?? 0n;
    }
    return { debit, credit, invalid };
  }, [lines, scale]);

  const update = (key: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const balanced = !totals.invalid && totals.debit === totals.credit && totals.debit > 0n;
  const payload = JSON.stringify(
    lines.map(({ accountId, debit, credit, description }) => ({
      accountId,
      debit: debit.trim() || '0',
      credit: credit.trim() || '0',
      ...(description.trim() ? { description: description.trim() } : {}),
    })),
  );

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <FormError message={state.error ?? state.fieldErrors?.form} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <input type="hidden" name="lines" value={payload} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field id="je-date" label={t('journal.postingDate')} error={state.fieldErrors?.postingDate}>
          <input
            id="je-date"
            name="postingDate"
            type="date"
            required
            defaultValue={state.values?.postingDate ?? defaultDate}
            className={inputClass}
            aria-invalid={state.fieldErrors?.postingDate ? true : undefined}
          />
        </Field>
        <Field id="je-description" label={t('common.description')} error={state.fieldErrors?.description}>
          <input
            id="je-description"
            name="description"
            required
            maxLength={500}
            defaultValue={state.values?.description ?? ''}
            className={inputClass}
            aria-invalid={state.fieldErrors?.description ? true : undefined}
          />
        </Field>
        {branches.length > 0 ? (
          <Field id="je-branch" label={t('common.branch')}>
            <select
              id="je-branch"
              name="branchId"
              className={inputClass}
              defaultValue={state.values?.branchId ?? ''}
            >
              {allowCompanyLevel ? <option value="">{t('common.companyLevel')}</option> : null}
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
      </div>

      <fieldset className="rounded-[var(--radius-card)] border border-[var(--color-border)] p-3">
        <legend className="px-1 font-semibold">{t('journal.lines')}</legend>
        <ol className="flex flex-col gap-3">
          {lines.map((l, i) => {
            const d = amount(l.debit, scale);
            const c = amount(l.credit, scale);
            return (
              <li
                key={l.key}
                className="grid grid-cols-1 gap-2 border-b border-[var(--color-border)] pb-3 sm:grid-cols-12"
              >
                <div className="sm:col-span-5">
                  <label className="sr-only" htmlFor={`je-acc-${l.key}`}>
                    {`${t('journal.account')} ${i + 1}`}
                  </label>
                  <select
                    id={`je-acc-${l.key}`}
                    className={inputClass}
                    value={l.accountId}
                    onChange={(e) => update(l.key, { accountId: e.target.value })}
                  >
                    <option value="">{t('journal.chooseAccount')}</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="sr-only" htmlFor={`je-dr-${l.key}`}>
                    {`${t('journal.debit')} ${i + 1}`}
                  </label>
                  <input
                    id={`je-dr-${l.key}`}
                    inputMode="decimal"
                    dir="ltr"
                    placeholder={t('journal.debit')}
                    className={inputClass}
                    value={l.debit}
                    aria-invalid={d === null ? true : undefined}
                    onChange={(e) =>
                      update(l.key, { debit: e.target.value, credit: e.target.value ? '' : l.credit })
                    }
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="sr-only" htmlFor={`je-cr-${l.key}`}>
                    {`${t('journal.credit')} ${i + 1}`}
                  </label>
                  <input
                    id={`je-cr-${l.key}`}
                    inputMode="decimal"
                    dir="ltr"
                    placeholder={t('journal.credit')}
                    className={inputClass}
                    value={l.credit}
                    aria-invalid={c === null ? true : undefined}
                    onChange={(e) =>
                      update(l.key, { credit: e.target.value, debit: e.target.value ? '' : l.debit })
                    }
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="sr-only" htmlFor={`je-desc-${l.key}`}>
                    {`${t('common.description')} ${i + 1}`}
                  </label>
                  <input
                    id={`je-desc-${l.key}`}
                    placeholder={t('common.description')}
                    className={inputClass}
                    value={l.description}
                    maxLength={500}
                    onChange={(e) => update(l.key, { description: e.target.value })}
                  />
                </div>
                <div className="sm:col-span-1">
                  <button
                    type="button"
                    className={`${buttonSecondary} w-full`}
                    disabled={lines.length <= 2}
                    onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                    aria-label={`${t('journal.removeLine')} ${i + 1}`}
                  >
                    ×
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
        <button
          type="button"
          className={`${buttonSecondary} mt-3`}
          onClick={() => {
            setLines((ls) => [
              ...ls,
              { key: nextKey, accountId: '', debit: '', credit: '', description: '' },
            ]);
            setNextKey((k) => k + 1);
          }}
        >
          {t('journal.addLine')}
        </button>
      </fieldset>

      <div aria-live="polite" className="flex flex-wrap items-center gap-4">
        <span>
          {t('journal.debit')}:{' '}
          <Ltr>
            {groupDigits(formatMinorUnits(totals.debit, scale))} {currency}
          </Ltr>
        </span>
        <span>
          {t('journal.credit')}:{' '}
          <Ltr>
            {groupDigits(formatMinorUnits(totals.credit, scale))} {currency}
          </Ltr>
        </span>
        {balanced ? (
          <span className="erp-badge erp-badge--up">✓ {t('journal.balanced')}</span>
        ) : (
          <span className="erp-badge erp-badge--down">
            {t('journal.unbalanced')}{' '}
            <Ltr>{groupDigits(formatMinorUnits(totals.debit - totals.credit, scale))}</Ltr>
          </span>
        )}
      </div>
      <p className="text-sm text-[var(--color-text-muted)]">{t('journal.immutable')}</p>
      <div>
        <SubmitButton label={t('journal.post')} locale={locale} />
      </div>
    </form>
  );
}
