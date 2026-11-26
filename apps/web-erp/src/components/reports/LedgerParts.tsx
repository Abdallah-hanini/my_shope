import { createTranslator, groupDigits, type Locale } from '@erp/localization';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { buttonPrimary, buttonSecondary, Card, inputClass } from '@/components/ui';
import { drCr, ledgerPresets, query } from '@/lib/ledger';

/** A signed balance shown as "1,250.00 Dr" / "50,000.00 Cr" (left-to-right digits in Arabic too). */
export function Balance({ value, locale }: { value: string; locale: Locale }) {
  const t = createTranslator(locale);
  const { amount, side } = drCr(value);
  return (
    <span className="whitespace-nowrap">
      <span dir="ltr" className="tabular">
        {groupDigits(amount)}
      </span>
      {side ? (
        <span className="ms-1 text-xs text-[var(--color-text-muted)]">
          {side === 'dr' ? t('ledger.dr') : t('ledger.cr')}
        </span>
      ) : null}
    </span>
  );
}

/** A total that is a debit or credit by definition: the side is always shown, also for zero. */
export function SideTotal({ value, side, locale }: { value: string; side: 'dr' | 'cr'; locale: Locale }) {
  const t = createTranslator(locale);
  return (
    <span className="whitespace-nowrap">
      <span dir="ltr" className="tabular">
        {groupDigits(value)}
      </span>
      <span className="ms-1 text-xs text-[var(--color-text-muted)]">
        {side === 'dr' ? t('ledger.dr') : t('ledger.cr')}
      </span>
    </span>
  );
}

/** Plain amount column (debit or credit); zero is shown faintly so the other column stands out. */
export function Amount({ value }: { value: string }) {
  const zero = /^0(\.0+)?$/.test(value);
  return (
    <span dir="ltr" className={`tabular ${zero ? 'text-[var(--color-text-muted)]' : ''}`}>
      {groupDigits(value)}
    </span>
  );
}

/** GET form: date range, branch and presets. Values live in the URL so a report can be shared. */
export function LedgerFilters({
  locale,
  action,
  timeZone,
  from,
  to,
  branch,
  branches,
  keep = {},
  children,
}: {
  locale: Locale;
  action: string;
  timeZone: string;
  from: string;
  to: string;
  branch?: string;
  branches: { id: string; label: string }[];
  /** Other parameters to keep (e.g. the account). */
  keep?: Record<string, string>;
  children?: ReactNode;
}) {
  const t = createTranslator(locale);
  const p = ledgerPresets(timeZone);
  const presets = [
    { label: t('ledger.thisMonth'), ...p.thisMonth },
    { label: t('ledger.lastMonth'), ...p.lastMonth },
    { label: t('ledger.thisYear'), ...p.thisYear },
  ];
  return (
    <Card className="mb-6">
      <form
        method="get"
        action={action}
        className="flex flex-wrap items-end gap-3"
        aria-label={t('ledger.filters')}
      >
        {Object.entries(keep).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        {children}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="f-from" className="text-[13px] font-medium">
            {t('ledger.from')}
          </label>
          <input
            id="f-from"
            name="from"
            type="date"
            required
            defaultValue={from}
            className={`${inputClass} w-44`}
            dir="ltr"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="f-to" className="text-[13px] font-medium">
            {t('ledger.to')}
          </label>
          <input
            id="f-to"
            name="to"
            type="date"
            required
            defaultValue={to}
            className={`${inputClass} w-44`}
            dir="ltr"
          />
        </div>
        {branches.length ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="f-branch" className="text-[13px] font-medium">
              {t('common.branch')}
            </label>
            <select id="f-branch" name="branch" defaultValue={branch ?? ''} className={`${inputClass} w-52`}>
              <option value="">{t('dash.allBranches')}</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <button type="submit" className={buttonPrimary}>
          {t('ledger.apply')}
        </button>
        <div className="flex flex-wrap gap-2 sm:ms-auto" role="group" aria-label={t('dash.period')}>
          {presets.map((x) => (
            <Link
              key={x.label}
              href={`${action}${query({ ...keep, from: x.from, to: x.to, branch })}`}
              aria-current={x.from === from && x.to === to ? 'true' : undefined}
              className={`${buttonSecondary} aria-[current=true]:border-[var(--color-primary)] aria-[current=true]:text-[var(--color-primary)]`}
            >
              {x.label}
            </Link>
          ))}
        </div>
      </form>
    </Card>
  );
}
