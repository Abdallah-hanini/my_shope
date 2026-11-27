import { unwrap, type FinancialSummary } from '@erp/api-client';
import {
  createTranslator,
  formatDateTime,
  groupDigits,
  isLocale,
  type Locale,
  type MessageKey,
} from '@erp/localization';
import { AlertTriangle, BookText, Landmark, Receipt, TrendingUp, Wallet } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { TrendChart } from '@/components/dashboard/charts';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { ProblemNotice } from '@/components/ProblemNotice';
import {
  buttonPrimary,
  buttonSecondary,
  Card,
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
import { companyName, loadCompany, localName } from '@/lib/context';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

function currentMonth(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit' })
    .format(new Date())
    .slice(0, 7);
}
function addMonths(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}
/** Numbers only for chart geometry; every displayed figure is the exact decimal string. */
const num = (v: string) => Number(v);

export default async function ExecutiveDashboard({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; companyId: string }>;
  searchParams: Promise<{ from?: string; to?: string; branch?: string }>;
}) {
  const { locale, companyId } = await params;
  const sp = await searchParams;
  if (!isLocale(locale)) notFound();
  const t = createTranslator(locale);
  const ctx = await loadCompany(companyId);
  if (!ctx.ok) return null;
  const { api, can, company } = ctx.data;
  const base = `/${locale}/c/${companyId}`;
  if (!can('reports.financial.read'))
    return <CompanyLinks locale={locale} base={base} can={can} title={companyName(company, locale)} />;

  const now = currentMonth(company.timezone);
  const to = sp.to && MONTH.test(sp.to) ? sp.to : now;
  const from = sp.from && MONTH.test(sp.from) ? sp.from : addMonths(to, -11);
  const branch = sp.branch && /^[0-9a-f-]{36}$/i.test(sp.branch) ? sp.branch : undefined;

  const [summary, branches] = await Promise.all([
    attempt(async () =>
      unwrap(
        await api.GET('/api/v1/companies/{companyId}/reports/financial-summary', {
          params: { path: { companyId }, query: { from, to, ...(branch ? { branchId: branch } : {}) } },
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

  const presets = [
    { label: t('dash.thisMonth'), from: now, to: now },
    { label: t('dash.last3'), from: addMonths(now, -2), to: now },
    { label: t('dash.thisYear'), from: `${now.slice(0, 4)}-01`, to: now },
    { label: t('dash.last12'), from: addMonths(now, -11), to: now },
  ];
  const href = (f: string, tt: string) => `${base}?from=${f}&to=${tt}${branch ? `&branch=${branch}` : ''}`;

  return (
    <>
      <PageHeader title={t('dash.title')}>
        {summary.ok ? (
          <span>
            {t('dash.freshness')}{' '}
            <time dateTime={summary.data.asOf}>
              {formatDateTime(locale, summary.data.asOf, company.timezone)}
            </time>
          </span>
        ) : null}
      </PageHeader>

      <Card className="mb-6">
        <form method="get" className="flex flex-wrap items-end gap-3" aria-label={t('dash.filters')}>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="f-from" className="text-[13px] font-medium">
              {t('dash.from')}
            </label>
            <input
              id="f-from"
              name="from"
              type="month"
              defaultValue={from}
              className={`${inputClass} w-40`}
              dir="ltr"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="f-to" className="text-[13px] font-medium">
              {t('dash.to')}
            </label>
            <input
              id="f-to"
              name="to"
              type="month"
              defaultValue={to}
              className={`${inputClass} w-40`}
              dir="ltr"
            />
          </div>
          {branches.ok && branches.data.length ? (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="f-branch" className="text-[13px] font-medium">
                {t('common.branch')}
              </label>
              <select
                id="f-branch"
                name="branch"
                defaultValue={branch ?? ''}
                className={`${inputClass} w-52`}
              >
                <option value="">{t('dash.allBranches')}</option>
                {branches.data.map((b) => (
                  <option key={b.id} value={b.id}>{`${b.code} — ${localName(b, locale)}`}</option>
                ))}
              </select>
            </div>
          ) : null}
          <button type="submit" className={buttonPrimary}>
            {t('dash.apply')}
          </button>
          <div className="flex flex-wrap gap-2 sm:ms-auto" role="group" aria-label={t('dash.period')}>
            {presets.map((p) => (
              <Link
                key={p.label}
                href={href(p.from, p.to)}
                aria-current={p.from === from && p.to === to ? 'true' : undefined}
                className={`${buttonSecondary} aria-[current=true]:border-[var(--color-primary)] aria-[current=true]:text-[var(--color-primary)]`}
              >
                {p.label}
              </Link>
            ))}
          </div>
        </form>
      </Card>

      {!summary.ok ? (
        <ProblemNotice result={summary} locale={locale} />
      ) : (
        <DashboardBody locale={locale} base={base} data={summary.data} />
      )}
    </>
  );
}

type Summary = FinancialSummary;

function DashboardBody({ locale, base, data }: { locale: Locale; base: string; data: Summary }) {
  const t = createTranslator(locale);
  const k = data.totals;
  const neg = (v: string) => v.startsWith('-');
  const noCash = data.exceptions.some((e) => e.kind === 'no_cash_accounts');
  const months = data.months.map((m) => m.month);
  const rtl = locale === 'ar';
  const exceptionHref = (e: Summary['exceptions'][number]) =>
    e.kind === 'period_open_after_end'
      ? `${base}/periods`
      : e.kind === 'reversal_in_range' && e.recordId
        ? `${base}/journals/${e.recordId}`
        : `${base}/accounts`;

  return (
    <>
      {data.scope === 'branches' ? <Notice>{t('dash.scopeBranches')}</Notice> : null}
      <section
        aria-label={t('dash.title')}
        className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6"
      >
        <KpiCard
          label={t('dash.revenue')}
          value={groupDigits(k.revenue)}
          currency={data.currency}
          icon={TrendingUp}
        />
        <KpiCard
          label={t('dash.grossProfit')}
          value={groupDigits(k.grossProfit)}
          currency={data.currency}
          icon={Receipt}
          tone={neg(k.grossProfit) ? 'negative' : 'neutral'}
          sub={
            k.grossMarginPercent === null ? (
              t('dash.marginNA')
            ) : (
              <>
                {t('dash.grossMargin')}: <Ltr>{k.grossMarginPercent}%</Ltr>
              </>
            )
          }
        />
        <KpiCard
          label={t('dash.operatingExpenses')}
          value={groupDigits(k.operatingExpenses)}
          currency={data.currency}
          icon={Wallet}
        />
        <KpiCard
          label={t('dash.netProfit')}
          value={groupDigits(k.netProfit)}
          currency={data.currency}
          icon={TrendingUp}
          tone={neg(k.netProfit) ? 'negative' : 'positive'}
        />
        <KpiCard
          label={t('dash.cashAndBank')}
          value={noCash ? '—' : groupDigits(k.cashAndBank)}
          currency={noCash ? undefined : data.currency}
          icon={Landmark}
          sub={noCash ? t('dash.notSetUp') : t('dash.cashAsOf')}
        />
        <KpiCard label={t('dash.journals')} value={String(k.journalCount)} icon={BookText} />
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Card title={t('dash.trend')} id="trend">
            <TrendChart
              label={t('dash.trend')}
              rtl={rtl}
              categories={months}
              series={[
                {
                  name: t('dash.revenue'),
                  type: 'bar',
                  color: 'primary',
                  values: data.months.map((m) => num(m.revenue)),
                },
                {
                  name: t('dash.expenses'),
                  type: 'bar',
                  color: 'muted',
                  values: data.months.map((m) => num(m.cogs) + num(m.operatingExpenses)),
                },
                {
                  name: t('dash.netProfit'),
                  type: 'line',
                  color: 'success',
                  values: data.months.map((m) => num(m.netProfit)),
                },
              ]}
            />
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-medium text-[var(--color-primary)]">
                {t('dash.showTable')}
              </summary>
              <Table caption={t('dash.trend')}>
                <thead>
                  <tr>
                    <th scope="col" className={th}>
                      {t('dash.month')}
                    </th>
                    <th scope="col" className={thNum}>
                      {t('dash.revenue')}
                    </th>
                    <th scope="col" className={thNum}>
                      {t('dash.cogs')}
                    </th>
                    <th scope="col" className={thNum}>
                      {t('dash.operatingExpenses')}
                    </th>
                    <th scope="col" className={thNum}>
                      {t('dash.netProfit')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.months.map((m) => (
                    <tr key={m.month}>
                      <th scope="row" className={`${td} text-start font-medium whitespace-nowrap`}>
                        <Ltr>{m.month}</Ltr>
                      </th>
                      <td className={tdNum}>
                        <Ltr>{groupDigits(m.revenue)}</Ltr>
                      </td>
                      <td className={tdNum}>
                        <Ltr>{groupDigits(m.cogs)}</Ltr>
                      </td>
                      <td className={tdNum}>
                        <Ltr>{groupDigits(m.operatingExpenses)}</Ltr>
                      </td>
                      <td className={tdNum}>
                        <Ltr>{groupDigits(m.netProfit)}</Ltr>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </details>
          </Card>
        </div>

        <Card title={t('dash.exceptions')} id="exceptions">
          {data.exceptions.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">{t('dash.noExceptions')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.exceptions.map((e, i) => (
                <li key={`${e.kind}-${e.recordId ?? i}`}>
                  <Link
                    href={exceptionHref(e)}
                    className="flex gap-3 rounded-[var(--radius-control)] border border-[var(--color-border)] p-3 text-sm hover:bg-[var(--color-surface-muted)]"
                  >
                    <AlertTriangle
                      aria-hidden
                      size={16}
                      className="mt-0.5 shrink-0 text-[var(--color-warning-brand)]"
                    />
                    <span className="min-w-0">
                      <span className="block font-medium">{t(`dash.exception.${e.kind}` as MessageKey)}</span>
                      {e.label || e.date ? (
                        <span className="block text-xs text-[var(--color-text-muted)]">
                          <Ltr>{[e.label, e.date].filter(Boolean).join(' · ')}</Ltr>
                        </span>
                      ) : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {data.branches.length > 1 ? (
        <Card title={t('dash.branches')} id="branches" flush>
          <div className="p-5 pb-0">
            <TrendChart
              label={t('dash.branches')}
              rtl={rtl}
              height={240}
              categories={data.branches.map((b) => b.code ?? t('common.companyLevel'))}
              series={[
                {
                  name: t('dash.revenue'),
                  type: 'bar',
                  color: 'primary',
                  values: data.branches.map((b) => num(b.revenue)),
                },
                {
                  name: t('dash.expenses'),
                  type: 'bar',
                  color: 'muted',
                  values: data.branches.map((b) => num(b.expenses)),
                },
              ]}
            />
          </div>
          <Table caption={t('dash.branches')}>
            <thead>
              <tr>
                <th scope="col" className={th}>
                  {t('common.branch')}
                </th>
                <th scope="col" className={thNum}>
                  {t('dash.revenue')}
                </th>
                <th scope="col" className={thNum}>
                  {t('dash.expenses')}
                </th>
                <th scope="col" className={thNum}>
                  {t('dash.netProfit')}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.branches.map((b) => (
                <tr key={b.branchId ?? 'company'}>
                  <th scope="row" className={`${td} text-start font-medium`}>
                    {b.branchId ? (
                      <>
                        <Ltr>{b.code}</Ltr> {locale === 'ar' && b.nameAr ? b.nameAr : b.name}
                      </>
                    ) : (
                      t('common.companyLevel')
                    )}
                  </th>
                  <td className={tdNum}>
                    <Ltr>{groupDigits(b.revenue)}</Ltr>
                  </td>
                  <td className={tdNum}>
                    <Ltr>{groupDigits(b.expenses)}</Ltr>
                  </td>
                  <td className={tdNum}>
                    <Ltr className={neg(b.netProfit) ? 'text-[var(--color-danger)]' : ''}>
                      {groupDigits(b.netProfit)}
                    </Ltr>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      ) : null}
    </>
  );
}

function CompanyLinks({
  locale,
  base,
  can,
  title,
}: {
  locale: Locale;
  base: string;
  can: (p: string) => boolean;
  title: string;
}) {
  const t = createTranslator(locale);
  const areas = [
    { href: `${base}/journals`, label: t('nav.journals'), p: 'accounting.journal.read' },
    { href: `${base}/accounts`, label: t('nav.accounts'), p: 'accounting.account.read' },
    { href: `${base}/periods`, label: t('nav.periods'), p: 'accounting.period.read' },
    { href: `${base}/branches`, label: t('nav.branches'), p: 'org.branch.read' },
    { href: `${base}/audit`, label: t('nav.audit'), p: 'audit.read' },
  ].filter((a) => can(a.p));
  return (
    <>
      <PageHeader title={title}>{t('overview.intro')}</PageHeader>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {areas.map((a) => (
          <li key={a.href}>
            <Link href={a.href} className={`${buttonSecondary} w-full justify-start`}>
              {a.label}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
