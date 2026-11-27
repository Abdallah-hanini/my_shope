import type { Api } from '@/lib/api';
import { createTranslator, groupDigits, type Locale, type MessageKey } from '@erp/localization';
import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  Badge,
  buttonSecondary,
  Card,
  fieldLabel,
  inputClass,
  Ltr,
  Table,
  td,
  tdNum,
  th,
  thNum,
} from '@/components/ui';
import { attempt } from '@/lib/api';
import { localName } from '@/lib/context';
import { asOfPresets, query } from '@/lib/ledger';
import { Amount } from './LedgerParts';

/** Branch choices for report filters (only for people who may read branches). */
export async function branchOptions(
  api: Api,
  can: (p: string) => boolean,
  companyId: string,
  locale: Locale,
) {
  if (!can('org.branch.read')) return [];
  const r = await attempt(async () => {
    const res = await api.GET('/api/v1/companies/{companyId}/branches', { params: { path: { companyId } } });
    if (!res.data) throw new Error('branches');
    return res.data;
  });
  return r.ok ? r.data.map((b) => ({ id: b.id, label: `${b.code} — ${localName(b, locale)}` })) : [];
}

/** GET form for "as of" reports: cut-off date, branch and presets; values live in the URL. */
export function AsOfFilters({
  locale,
  action,
  timeZone,
  asOf,
  branch,
  branches,
}: {
  locale: Locale;
  action: string;
  timeZone: string;
  asOf: string;
  branch?: string;
  branches: { id: string; label: string }[];
}) {
  const t = createTranslator(locale);
  const p = asOfPresets(timeZone);
  const presets = [
    { label: t('rpt.today'), asOf: p.today },
    { label: t('rpt.endOfLastMonth'), asOf: p.endOfLastMonth },
    { label: t('rpt.endOfLastYear'), asOf: p.endOfLastYear },
  ];
  return (
    <Card className="mb-6 print:hidden">
      <form
        method="get"
        action={action}
        className="flex flex-wrap items-end gap-3"
        aria-label={t('rpt.filters')}
      >
        <label className={fieldLabel}>
          {t('rpt.asOf')}
          <input
            type="date"
            name="asOf"
            defaultValue={asOf}
            required
            dir="ltr"
            className={`${inputClass} w-44`}
          />
        </label>
        {branches.length > 1 ? (
          <label className={fieldLabel}>
            {t('common.branch')}
            <select name="branch" defaultValue={branch ?? ''} className={`${inputClass} w-56`}>
              <option value="">{t('dash.allBranches')}</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <button type="submit" className={buttonSecondary}>
          {t('ledger.apply')}
        </button>
        <span className="flex flex-wrap gap-1.5">
          {presets.map((x) => (
            <Link
              key={x.label}
              href={`${action}${query({ asOf: x.asOf, branch })}`}
              aria-current={x.asOf === asOf ? 'true' : undefined}
              className="inline-flex min-h-8 items-center rounded-full border border-[var(--color-border)] px-3 text-[13px] hover:bg-[var(--color-surface-muted)] aria-[current=true]:border-[var(--color-primary)] aria-[current=true]:text-[var(--color-primary)]"
            >
              {x.label}
            </Link>
          ))}
        </span>
      </form>
    </Card>
  );
}

/** Change against the comparison period: arrow and percentage; "—" when the base is zero. */
export function Change({ pct, better = 'up' }: { pct: string | null; better?: 'up' | 'down' }) {
  if (pct === null) return <span className="text-[var(--color-text-muted)]">—</span>;
  const n = Number(pct);
  if (n === 0) return <Ltr className="text-[var(--color-text-muted)]">0.0%</Ltr>;
  const good = better === 'up' ? n > 0 : n < 0;
  return (
    <Ltr className={good ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}>
      {`${n > 0 ? '▲' : '▼'} ${Math.abs(n).toFixed(1)}%`}
    </Ltr>
  );
}

type Line = {
  accountId: string;
  code: string;
  name: string;
  nameAr?: string | null;
  amount: string;
  previous?: string | null;
  changePct?: string | null;
};

/** One statement section: account lines (each drills into the general ledger) and its total. */
export function SectionRows({
  locale,
  title,
  lines,
  total,
  previousTotal,
  compare,
  ledgerHref,
  better = 'up',
}: {
  locale: Locale;
  title: string;
  lines: Line[];
  total: string;
  previousTotal?: string | null;
  compare: boolean;
  ledgerHref?: (accountId: string) => string;
  better?: 'up' | 'down';
}) {
  const t = createTranslator(locale);
  return (
    <>
      <tr>
        <th
          colSpan={compare ? 4 : 2}
          scope="colgroup"
          className={`${th} bg-[var(--color-surface)] pt-4 text-[13px] font-semibold text-[var(--color-text)]`}
        >
          {title}
        </th>
      </tr>
      {lines.length === 0 ? (
        <tr>
          <td colSpan={compare ? 4 : 2} className={`${td} text-[var(--color-text-muted)]`}>
            {t('rpt.nothing')}
          </td>
        </tr>
      ) : (
        lines.map((l) => (
          <tr key={l.accountId} data-account={l.code}>
            <td className={`${td} ps-8`}>
              {ledgerHref ? (
                <Link href={ledgerHref(l.accountId)} className="hover:underline">
                  <Ltr className="text-[var(--color-text-muted)]">{l.code}</Ltr>{' '}
                  {locale === 'ar' && l.nameAr ? l.nameAr : l.name}
                </Link>
              ) : (
                <>
                  <Ltr className="text-[var(--color-text-muted)]">{l.code}</Ltr>{' '}
                  {locale === 'ar' && l.nameAr ? l.nameAr : l.name}
                </>
              )}
            </td>
            <td className={tdNum}>
              <Amount value={l.amount} />
            </td>
            {compare ? (
              <>
                <td className={tdNum}>
                  <Amount value={l.previous ?? '0.00'} />
                </td>
                <td className={tdNum}>
                  <Change pct={l.changePct ?? null} better={better} />
                </td>
              </>
            ) : null}
          </tr>
        ))
      )}
      <tr className="font-semibold">
        <td className={td}>{`${t('rpt.total')} ${title.toLowerCase()}`}</td>
        <td className={tdNum}>
          <Amount value={total} />
        </td>
        {compare ? (
          <>
            <td className={tdNum}>
              <Amount value={previousTotal ?? '0.00'} />
            </td>
            <td className={tdNum} />
          </>
        ) : null}
      </tr>
    </>
  );
}

/** A highlighted result row (gross profit, net profit, totals). */
export function ResultRow({
  label,
  amount,
  previous,
  changePct,
  compare,
  strong,
  note,
}: {
  label: string;
  amount: string;
  previous?: string | null;
  changePct?: string | null;
  compare: boolean;
  strong?: boolean;
  note?: ReactNode;
}) {
  const cls = strong
    ? 'bg-[var(--color-primary-soft)] font-semibold'
    : 'bg-[var(--color-surface-muted)]/60 font-semibold';
  return (
    <tr className={cls} data-result={label}>
      <td className={td}>
        {label}
        {note ? (
          <span className="ms-2 text-xs font-normal text-[var(--color-text-muted)]">{note}</span>
        ) : null}
      </td>
      <td className={tdNum}>
        <Amount value={amount} />
      </td>
      {compare ? (
        <>
          <td className={tdNum}>
            <Amount value={previous ?? '0.00'} />
          </td>
          <td className={tdNum}>
            <Change pct={changePct ?? null} />
          </td>
        </>
      ) : null}
    </tr>
  );
}

/** Aging grid: one row per customer or supplier, one column per bucket, totals at the foot. */
export function AgingTable({
  locale,
  caption,
  partyLabel,
  buckets,
  parties,
  totals,
  total,
  partyHref,
}: {
  locale: Locale;
  caption: string;
  partyLabel: string;
  buckets: string[];
  parties: { id: string; name: string; documents: number; buckets: Record<string, string>; total: string }[];
  totals: Record<string, string>;
  total: string;
  partyHref?: (id: string) => string | null;
}) {
  const t = createTranslator(locale);
  return (
    <Table caption={caption}>
      <thead>
        <tr>
          <th scope="col" className={th}>
            {partyLabel}
          </th>
          {buckets.map((b) => (
            <th key={b} scope="col" className={thNum}>
              {t(`rpt.bucket.${b}` as MessageKey)}
            </th>
          ))}
          <th scope="col" className={thNum}>
            {t('rpt.total')}
          </th>
        </tr>
      </thead>
      <tbody>
        {parties.map((p) => {
          const href = partyHref?.(p.id) ?? null;
          return (
            <tr key={p.id} data-party={p.name}>
              <th scope="row" className={`${td} text-start font-medium`}>
                {href ? (
                  <Link href={href} className="text-[var(--color-primary)] hover:underline">
                    {p.name}
                  </Link>
                ) : (
                  p.name
                )}
                <span className="ms-2 text-xs font-normal text-[var(--color-text-muted)]">
                  {t('rpt.docs').replace('{n}', String(p.documents))}
                </span>
              </th>
              {buckets.map((b) => (
                <td key={b} className={tdNum}>
                  <Amount value={p.buckets[b] ?? '0.00'} />
                </td>
              ))}
              <td className={`${tdNum} font-semibold`}>
                <Amount value={p.total} />
              </td>
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr className="font-semibold">
          <th scope="row" className={`${td} text-start`}>
            {t('rpt.total')}
          </th>
          {buckets.map((b) => (
            <td key={b} className={tdNum}>
              <Amount value={totals[b] ?? '0.00'} />
            </td>
          ))}
          <td className={tdNum}>
            <Amount value={total} />
          </td>
        </tr>
      </tfoot>
    </Table>
  );
}

/** Reconciliation line under a report: document total vs the control account in the ledger. */
export function Reconciliation({
  locale,
  reconciled,
  documents,
  ledger,
  currency,
}: {
  locale: Locale;
  reconciled: boolean;
  documents: string;
  ledger: string | null;
  currency: string;
}) {
  const t = createTranslator(locale);
  return (
    <p className="mb-4 flex flex-wrap items-center gap-2 text-sm" data-reconciled={String(reconciled)}>
      {ledger === null ? (
        <Badge tone="warning">{t('rpt.noControlAccount')}</Badge>
      ) : reconciled ? (
        <Badge tone="success">✓ {t('rpt.reconciled')}</Badge>
      ) : (
        <Badge tone="danger">{t('rpt.notReconciled')}</Badge>
      )}
      <span className="text-[var(--color-text-muted)]">
        {t('rpt.openDocs')}: <Ltr>{`${groupDigits(documents)} ${currency}`}</Ltr>
        {ledger !== null ? (
          <>
            {' · '}
            {t('rpt.controlAccount')}: <Ltr>{`${groupDigits(ledger)} ${currency}`}</Ltr>
          </>
        ) : null}
      </span>
    </p>
  );
}

/** GET form with a branch and, optionally, a year (low stock, targets); values live in the URL. */
export function BranchYearFilters({
  locale,
  action,
  branch,
  branches,
  year,
  allLabel,
}: {
  locale: Locale;
  action: string;
  branch?: string;
  branches: { id: string; label: string }[];
  year?: number;
  /** Label of the empty branch choice; omit to require a branch. */
  allLabel?: string;
}) {
  const t = createTranslator(locale);
  if (year === undefined && branches.length <= 1) return null;
  return (
    <Card className="mb-6 print:hidden">
      <form
        method="get"
        action={action}
        className="flex flex-wrap items-end gap-3"
        aria-label={t('rpt.filters')}
      >
        {year !== undefined ? (
          <label className={fieldLabel}>
            {t('plan.year')}
            <input
              type="number"
              name="year"
              min={2000}
              max={2100}
              defaultValue={year}
              required
              dir="ltr"
              className={`${inputClass} w-28`}
            />
          </label>
        ) : null}
        {branches.length > 1 || !allLabel ? (
          <label className={fieldLabel}>
            {t('common.branch')}
            <select name="branch" defaultValue={branch ?? ''} className={`${inputClass} w-56`}>
              {allLabel ? <option value="">{allLabel}</option> : null}
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <button type="submit" className={buttonSecondary}>
          {t('ledger.apply')}
        </button>
      </form>
    </Card>
  );
}
