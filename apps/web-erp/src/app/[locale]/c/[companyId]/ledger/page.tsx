import { unwrap } from '@erp/api-client';
import { createTranslator, formatDateTime, isLocale } from '@erp/localization';
import { BookOpen } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProblemNotice } from '@/components/ProblemNotice';
import { ExportForm } from '@/components/reports/ExportForm';
import { Amount, Balance, LedgerFilters } from '@/components/reports/LedgerParts';
import {
  buttonSecondary,
  Card,
  EmptyState,
  inputClass,
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
const CURSOR = /^[A-Za-z0-9_-]{1,200}$/;

/** WEB-100 General ledger (docs/SCREEN_CONTRACTS.md). */
export default async function GeneralLedgerPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; companyId: string }>;
  searchParams: Promise<{ account?: string; from?: string; to?: string; branch?: string; cursor?: string }>;
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
  const accountId = sp.account && UUID.test(sp.account) ? sp.account : undefined;
  const cursor = sp.cursor && CURSOR.test(sp.cursor) ? sp.cursor : undefined;
  const base = `/${locale}/c/${companyId}`;
  const path = { params: { path: { companyId } } };

  const [ledger, accounts, branches] = await Promise.all([
    accountId
      ? attempt(async () =>
          unwrap(
            await api.GET('/api/v1/companies/{companyId}/reports/general-ledger', {
              params: {
                path: { companyId },
                query: {
                  accountId,
                  from,
                  to,
                  ...(branch ? { branchId: branch } : {}),
                  ...(cursor ? { cursor } : {}),
                },
              },
            }),
          ),
        )
      : Promise.resolve(null),
    can('accounting.account.read')
      ? attempt(async () => unwrap(await api.GET('/api/v1/companies/{companyId}/accounts', path)))
      : Promise.resolve(null),
    can('org.branch.read')
      ? attempt(async () => unwrap(await api.GET('/api/v1/companies/{companyId}/branches', path)))
      : Promise.resolve(null),
  ]);
  const postingAccounts = accounts?.ok ? accounts.data.filter((a) => a.isPosting) : [];
  const g = ledger?.ok ? ledger.data : null;
  const title = g ? `${g.account.code} — ${localName(g.account, locale)}` : t('nav.generalLedger');
  const here = (extra: Record<string, string | undefined>) =>
    `${base}/ledger${query({ account: accountId, from, to, branch, ...extra })}`;

  return (
    <>
      <PageHeader
        title={title}
        actions={
          g ? (
            <ExportForm
              compact
              locale={locale}
              action={requestExportAction.bind(null, locale, companyId)}
              kinds={['general_ledger']}
              initial={{ kind: 'general_ledger', from, to, branchId: branch, accountId: g.account.id }}
            />
          ) : null
        }
      >
        {g ? (
          <span>
            {t('nav.generalLedger')} · {t('dash.freshness')}{' '}
            <time dateTime={g.asOf}>{formatDateTime(locale, g.asOf, company.timezone)}</time> · {g.currency}
          </span>
        ) : null}
      </PageHeader>
      <LedgerFilters
        locale={locale}
        action={`${base}/ledger`}
        timeZone={company.timezone}
        from={from}
        to={to}
        branch={branch}
        keep={accountId && !postingAccounts.length ? { account: accountId } : {}}
        branches={
          branches?.ok
            ? branches.data.map((b) => ({ id: b.id, label: `${b.code} — ${localName(b, locale)}` }))
            : []
        }
      >
        {postingAccounts.length ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="f-account" className="text-[13px] font-medium">
              {t('ledger.account')}
            </label>
            <select
              id="f-account"
              name="account"
              required
              defaultValue={accountId ?? ''}
              className={`${inputClass} w-72`}
            >
              <option value="" disabled>
                {t('ledger.chooseAccount')}
              </option>
              {postingAccounts.map((a) => (
                <option key={a.id} value={a.id}>{`${a.code} — ${localName(a, locale)}`}</option>
              ))}
            </select>
          </div>
        ) : null}
      </LedgerFilters>

      {!accountId ? (
        <Notice>{postingAccounts.length ? t('ledger.pickHelp') : t('ledger.noAccountList')}</Notice>
      ) : !ledger?.ok ? (
        ledger ? (
          <ProblemNotice result={ledger} locale={locale} />
        ) : null
      ) : (
        <>
          {g!.scope === 'branches' ? <Notice>{t('dash.scopeBranches')}</Notice> : null}
          <dl className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5" aria-label={t('ledger.totals')}>
            {[
              [t('ledger.opening'), <Balance key="o" value={g!.opening} locale={locale} />],
              [t('ledger.periodDebit'), <Amount key="d" value={g!.periodDebit} />],
              [t('ledger.periodCredit'), <Amount key="c" value={g!.periodCredit} />],
              [t('ledger.closing'), <Balance key="z" value={g!.closing} locale={locale} />],
              [t('ledger.lines'), <Ltr key="n">{g!.lineCount}</Ltr>],
            ].map(([label, value], i) => (
              <div
                key={i}
                className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
              >
                <dt className="text-xs text-[var(--color-text-muted)]">{label}</dt>
                <dd className="mt-1 text-lg font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
          <Card flush>
            {g!.lines.length === 0 ? (
              <EmptyState icon={<BookOpen aria-hidden size={18} />}>{t('ledger.noLines')}</EmptyState>
            ) : (
              <Table caption={`${title} ${from} – ${to}`}>
                <thead>
                  <tr>
                    <th scope="col" className={th}>
                      {t('ledger.date')}
                    </th>
                    <th scope="col" className={th}>
                      {t('ledger.journal')}
                    </th>
                    <th scope="col" className={th}>
                      {t('ledger.description')}
                    </th>
                    <th scope="col" className={thNum}>
                      {t('ledger.debit')}
                    </th>
                    <th scope="col" className={thNum}>
                      {t('ledger.credit')}
                    </th>
                    <th scope="col" className={thNum}>
                      {t('ledger.balance')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-[var(--color-surface-muted)]">
                    <th scope="row" colSpan={5} className={`${td} text-start font-medium`}>
                      {cursor ? t('ledger.broughtForward') : t('ledger.opening')}
                    </th>
                    <td className={tdNum}>
                      <Balance value={g!.pageOpening} locale={locale} />
                    </td>
                  </tr>
                  {g!.lines.map((l) => (
                    <tr key={l.lineId}>
                      <td className={`${td} whitespace-nowrap`}>
                        <Ltr>{l.postingDate}</Ltr>
                      </td>
                      <td className={`${td} whitespace-nowrap`}>
                        <Link
                          href={`${base}/journals/${l.journalId}`}
                          className="font-medium text-[var(--color-primary)] hover:underline"
                        >
                          <Ltr>{l.journalNumber}</Ltr>
                        </Link>
                      </td>
                      <td className={td}>{l.description}</td>
                      <td className={tdNum}>
                        <Amount value={l.debit} />
                      </td>
                      <td className={tdNum}>
                        <Amount value={l.credit} />
                      </td>
                      <td className={tdNum}>
                        <Balance value={l.balance} locale={locale} />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="font-semibold">
                  <tr>
                    <th scope="row" colSpan={5} className={`${td} text-start`}>
                      {g!.nextCursor ? t('ledger.carriedForward') : t('ledger.closing')}
                    </th>
                    <td className={tdNum}>
                      <Balance value={g!.lines.at(-1)?.balance ?? g!.pageOpening} locale={locale} />
                    </td>
                  </tr>
                </tfoot>
              </Table>
            )}
          </Card>
          {cursor || g!.nextCursor ? (
            <nav className="flex flex-wrap gap-2" aria-label={t('ledger.lines')}>
              {cursor ? (
                <Link className={buttonSecondary} href={here({})}>
                  {t('ledger.first')}
                </Link>
              ) : null}
              {g!.nextCursor ? (
                <Link className={buttonSecondary} href={here({ cursor: g!.nextCursor })}>
                  {t('ledger.next')}
                </Link>
              ) : null}
            </nav>
          ) : null}
        </>
      )}
    </>
  );
}
