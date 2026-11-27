import { unwrap } from '@erp/api-client';
import { createTranslator, formatDateTime, groupDigits, isLocale } from '@erp/localization';
import { Scale } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProblemNotice } from '@/components/ProblemNotice';
import { ExportForm } from '@/components/reports/ExportForm';
import { Amount, Balance, LedgerFilters, SideTotal } from '@/components/reports/LedgerParts';
import {
  Badge,
  Card,
  EmptyState,
  Ltr,
  Notice,
  PageHeader,
  Table,
  td,
  tdNum,
  th,
  thNum,
} from '@/components/ui';
import { attempt } from '@/lib/api';
import { loadCompany, localName } from '@/lib/context';
import { ledgerRange, query } from '@/lib/ledger';
import { requestExportAction } from '../export-actions';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** WEB-122 Trial balance (docs/SCREEN_CONTRACTS.md). */
export default async function TrialBalancePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; companyId: string }>;
  searchParams: Promise<{ from?: string; to?: string; branch?: string; zero?: string }>;
}) {
  const { locale, companyId } = await params;
  const sp = await searchParams;
  if (!isLocale(locale)) notFound();
  const t = createTranslator(locale);
  const ctx = await loadCompany(companyId);
  if (!ctx.ok) return null;
  const { api, can, company } = ctx.data;
  const { from, to } = ledgerRange(company.timezone, sp);
  const branch = sp.branch && UUID.test(sp.branch) ? sp.branch : undefined;
  const includeZero = sp.zero === '1';
  const base = `/${locale}/c/${companyId}`;

  const [tb, branches] = await Promise.all([
    attempt(async () =>
      unwrap(
        await api.GET('/api/v1/companies/{companyId}/reports/trial-balance', {
          params: {
            path: { companyId },
            query: {
              from,
              to,
              ...(branch ? { branchId: branch } : {}),
              ...(includeZero ? { includeZero: 'true' } : {}),
            },
          },
        }),
      ),
    ),
    can('org.branch.read')
      ? attempt(async () =>
          unwrap(
            await api.GET('/api/v1/companies/{companyId}/branches', { params: { path: { companyId } } }),
          ),
        )
      : Promise.resolve({ ok: true as const, data: [] }),
  ]);
  const canLedger = can('accounting.journal.read');
  const ledgerHref = (accountId: string) =>
    `${base}/ledger${query({ account: accountId, from, to, branch })}`;

  return (
    <>
      <PageHeader
        title={t('nav.trialBalance')}
        actions={
          tb.ok ? (
            <ExportForm
              compact
              locale={locale}
              action={requestExportAction.bind(null, locale, companyId)}
              kinds={['trial_balance']}
              initial={{ kind: 'trial_balance', from, to, branchId: branch, includeZero }}
            />
          ) : null
        }
      >
        {tb.ok ? (
          <span>
            {t('dash.freshness')}{' '}
            <time dateTime={tb.data.asOf}>{formatDateTime(locale, tb.data.asOf, company.timezone)}</time> ·{' '}
            {company.baseCurrency}
          </span>
        ) : null}
      </PageHeader>
      <LedgerFilters
        locale={locale}
        action={`${base}/trial-balance`}
        timeZone={company.timezone}
        from={from}
        to={to}
        branch={branch}
        keep={includeZero ? { zero: '1' } : {}}
        branches={
          branches.ok
            ? branches.data.map((b) => ({ id: b.id, label: `${b.code} — ${localName(b, locale)}` }))
            : []
        }
      >
        <label className="flex min-h-10 items-center gap-2 text-sm">
          <input type="checkbox" name="zero" value="1" defaultChecked={includeZero} className="size-4" />
          {t('ledger.includeZero')}
        </label>
      </LedgerFilters>

      {!tb.ok ? (
        <ProblemNotice result={tb} locale={locale} />
      ) : (
        <>
          {tb.data.scope === 'branches' ? <Notice>{t('dash.scopeBranches')}</Notice> : null}
          {tb.data.balanced ? (
            <p className="mb-4">
              <Badge tone="success">✓ {t('ledger.balanced')}</Badge>
            </p>
          ) : (
            <Notice tone="danger">{t('ledger.unbalanced')}</Notice>
          )}
          <Card flush>
            {tb.data.rows.length === 0 ? (
              <EmptyState icon={<Scale aria-hidden size={18} />}>{t('ledger.empty')}</EmptyState>
            ) : (
              <Table caption={`${t('nav.trialBalance')} ${from} – ${to}`}>
                <thead>
                  <tr>
                    <th scope="col" className={th}>
                      {t('ledger.account')}
                    </th>
                    <th scope="col" className={thNum}>
                      {t('ledger.opening')}
                    </th>
                    <th scope="col" className={thNum}>
                      {t('ledger.periodDebit')}
                    </th>
                    <th scope="col" className={thNum}>
                      {t('ledger.periodCredit')}
                    </th>
                    <th scope="col" className={thNum}>
                      {t('ledger.closing')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {tb.data.rows.map((r) => {
                    const header = !r.account.isPosting;
                    const name = (
                      <span className="inline-flex flex-wrap items-baseline gap-x-2">
                        <Ltr className="text-[var(--color-text-muted)]">{r.account.code}</Ltr>
                        <span>{localName(r.account, locale)}</span>
                      </span>
                    );
                    return (
                      <tr
                        key={r.account.id}
                        className={header ? 'bg-[var(--color-surface-muted)] font-semibold' : undefined}
                      >
                        <th
                          scope="row"
                          className={`${td} text-start font-[inherit]`}
                          style={{ paddingInlineStart: `${16 + r.level * 20}px` }}
                        >
                          {!header && canLedger ? (
                            <Link
                              href={ledgerHref(r.account.id)}
                              className="text-[var(--color-primary)] hover:underline"
                              aria-label={`${t('ledger.openLedger')} ${r.account.code} ${localName(r.account, locale)}`}
                            >
                              {name}
                            </Link>
                          ) : (
                            name
                          )}
                          {header ? <span className="sr-only"> ({t('ledger.header')})</span> : null}
                        </th>
                        <td className={tdNum}>
                          <Balance value={r.opening} locale={locale} />
                        </td>
                        <td className={tdNum}>
                          <Amount value={r.periodDebit} />
                        </td>
                        <td className={tdNum}>
                          <Amount value={r.periodCredit} />
                        </td>
                        <td className={tdNum}>
                          <Balance value={r.closing} locale={locale} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="font-semibold">
                  <tr>
                    <th scope="row" className={`${td} text-start`}>
                      {t('ledger.totalDebit')}
                    </th>
                    <td className={tdNum}>
                      <SideTotal value={tb.data.totals.openingDebit} side="dr" locale={locale} />
                    </td>
                    <td className={tdNum}>
                      <Amount value={tb.data.totals.periodDebit} />
                    </td>
                    <td className={tdNum} />
                    <td className={tdNum}>
                      <SideTotal value={tb.data.totals.closingDebit} side="dr" locale={locale} />
                    </td>
                  </tr>
                  <tr>
                    <th scope="row" className={`${td} text-start`}>
                      {t('ledger.totalCredit')}
                    </th>
                    <td className={tdNum}>
                      <SideTotal value={tb.data.totals.openingCredit} side="cr" locale={locale} />
                    </td>
                    <td className={tdNum} />
                    <td className={tdNum}>
                      <Amount value={tb.data.totals.periodCredit} />
                    </td>
                    <td className={tdNum}>
                      <SideTotal value={tb.data.totals.closingCredit} side="cr" locale={locale} />
                    </td>
                  </tr>
                </tfoot>
              </Table>
            )}
          </Card>
          <Card>
            <p className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm">{t('ledger.periodResult')}</span>
              <span className="text-lg font-semibold" data-testid="period-result">
                <Ltr>{groupDigits(tb.data.periodResult)}</Ltr> {tb.data.currency}
              </span>
            </p>
            <p className="mt-2 text-xs text-[var(--color-text-muted)]">{t('ledger.noYearEnd')}</p>
          </Card>
        </>
      )}
    </>
  );
}
