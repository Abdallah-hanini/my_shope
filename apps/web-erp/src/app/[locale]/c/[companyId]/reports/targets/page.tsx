import { unwrap } from '@erp/api-client';
import { createTranslator, formatDateTime, groupDigits, isLocale } from '@erp/localization';
import { Gauge, Target, TrendingUp } from 'lucide-react';
import { notFound, redirect } from 'next/navigation';
import { TrendChart } from '@/components/dashboard/charts';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { PrintButton } from '@/components/PrintButton';
import { ProblemNotice } from '@/components/ProblemNotice';
import { Amount } from '@/components/reports/LedgerParts';
import { BranchYearFilters, branchOptions } from '@/components/reports/Statements';
import {
  Badge,
  buttonSecondary,
  Card,
  fieldLabel,
  inputClass,
  Ltr,
  Notice,
  PageHeader,
  SplitLayout,
  Table,
  td,
  tdNum,
  th,
  thNum,
} from '@/components/ui';
import { InlineForm } from '@/components/workshop/InlineForm';
import { attempt } from '@/lib/api';
import { loadCompany } from '@/lib/context';
import { targetAction } from '../../target-actions';

const UUID = /^[0-9a-f-]{36}$/i;

/** Sales targets against actual sales (RPT-SAL-03, R3a): owner-set monthly targets, pace. */
export default async function TargetsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; companyId: string }>;
  searchParams: Promise<{ year?: string; branch?: string }>;
}) {
  const { locale, companyId } = await params;
  if (!isLocale(locale)) notFound();
  const sp = await searchParams;
  const t = createTranslator(locale);
  const ctx = await loadCompany(companyId);
  if (!ctx.ok) return null;
  const { api, can, company } = ctx.data;
  const thisMonth = new Intl.DateTimeFormat('en-CA', {
    timeZone: company.timezone,
    year: 'numeric',
    month: '2-digit',
  })
    .format(new Date())
    .slice(0, 7);
  const thisYear = Number(thisMonth.slice(0, 4));
  const yearRaw = Number(sp.year);
  const year = Number.isInteger(yearRaw) && yearRaw >= 2000 && yearRaw <= 2100 ? yearRaw : thisYear;
  const branch = sp.branch && UUID.test(sp.branch) ? sp.branch : undefined;
  const base = `/${locale}/c/${companyId}`;
  const here = `${base}/reports/targets?year=${year}${branch ? `&branch=${branch}` : ''}`;
  const [res, branches] = await Promise.all([
    attempt(async () =>
      unwrap(
        await api.GET('/api/v1/companies/{companyId}/reports/targets', {
          params: { path: { companyId }, query: { year, ...(branch ? { branchId: branch } : {}) } },
        }),
      ),
    ),
    branchOptions(api, can, companyId, locale),
  ]);
  // Branch-limited readers have no company target: open their first branch instead.
  if (!res.ok && res.status === 422 && !branch && branches[0])
    redirect(`${base}/reports/targets?year=${year}&branch=${branches[0].id}`);
  const cur = company.baseCurrency;
  const rtl = locale === 'ar';
  const act = (op: Parameters<typeof targetAction>[2]) => targetAction.bind(null, locale, companyId, op);
  return (
    <>
      <PageHeader
        title={t('plan.targets')}
        back={{ href: `${base}/reports`, label: t('rpt.center') }}
        actions={<PrintButton label={t('rpt.print')} />}
      >
        {res.ok ? (
          <span>
            <Ltr>{String(year)}</Ltr> · {cur} · {t('plan.computedAt')}{' '}
            <time dateTime={res.data.asOf}>{formatDateTime(locale, res.data.asOf, company.timezone)}</time>
          </span>
        ) : null}
      </PageHeader>
      <BranchYearFilters
        locale={locale}
        action={`${base}/reports/targets`}
        branch={branch}
        branches={branches}
        year={year}
        allLabel={t('plan.wholeCompany')}
      />
      {!res.ok ? (
        <ProblemNotice result={res} locale={locale} />
      ) : (
        <SplitLayout
          main={
            <>
              <section aria-label={t('plan.targets')} className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <KpiCard
                  label={t('plan.targetYear')}
                  value={groupDigits(res.data.targetTotal)}
                  currency={cur}
                  icon={Target}
                />
                <KpiCard
                  label={t('plan.actualTargeted')}
                  value={groupDigits(res.data.actualOfTargeted)}
                  currency={cur}
                  icon={TrendingUp}
                />
                <KpiCard
                  label={t('plan.paceThisMonth')}
                  value={res.data.pace ? groupDigits(res.data.pace.actual) : '—'}
                  currency={res.data.pace ? cur : undefined}
                  icon={Gauge}
                  sub={
                    res.data.pace
                      ? `${t('plan.expectedByNow')}: ${groupDigits(res.data.pace.expected)} (${res.data.pace.day}/${res.data.pace.days})`
                      : t('plan.noTargetThisMonth')
                  }
                  tone={res.data.pace ? (res.data.pace.behind ? 'negative' : 'positive') : 'neutral'}
                />
              </section>
              {res.data.pace ? (
                <div data-pace={res.data.pace.behind ? 'behind' : 'on-track'}>
                  <Notice tone={res.data.pace.behind ? 'warning' : 'success'}>
                    {res.data.pace.behind ? t('plan.behind') : t('plan.onTrack')}
                  </Notice>
                </div>
              ) : null}
              <Card title={t('plan.byMonth')} id="by-month">
                <TrendChart
                  label={t('plan.byMonth')}
                  rtl={rtl}
                  categories={res.data.months.map((m) => m.month.slice(5))}
                  series={[
                    {
                      name: t('plan.target'),
                      type: 'bar',
                      color: 'muted',
                      values: res.data.months.map((m) => (m.target ? Number(m.target) : null)),
                    },
                    {
                      name: t('plan.actual'),
                      type: 'bar',
                      color: 'primary',
                      values: res.data.months.map((m) => Number(m.actual)),
                    },
                  ]}
                />
              </Card>
              <Card title={t('plan.byMonthTable')} id="months" flush>
                <Table caption={t('plan.byMonthTable')}>
                  <thead>
                    <tr>
                      <th scope="col" className={th}>
                        {t('plan.month')}
                      </th>
                      <th scope="col" className={thNum}>
                        {t('plan.target')}
                      </th>
                      <th scope="col" className={thNum}>
                        {t('plan.actual')}
                      </th>
                      <th scope="col" className={thNum}>
                        {t('plan.achievement')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {res.data.months.map((m) => (
                      <tr key={m.month} data-target-month={m.month}>
                        <td className={td}>
                          <Ltr>{m.month}</Ltr>
                        </td>
                        <td className={tdNum}>{m.target ? <Amount value={m.target} /> : '—'}</td>
                        <td className={tdNum}>
                          <Amount value={m.actual} />
                        </td>
                        <td className={tdNum}>
                          {m.achievementPct ? (
                            <Badge tone={Number(m.achievementPct) >= 100 ? 'success' : 'neutral'}>
                              <Ltr>{`${m.achievementPct}%`}</Ltr>
                            </Badge>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Card>
              <p className="text-xs text-[var(--color-text-muted)]">{t('plan.targetsNote')}</p>
            </>
          }
          side={
            res.data.canManage ? (
              <Card title={t('plan.setTarget')} id="set-target">
                <InlineForm
                  action={act({ kind: 'set', back: here })}
                  locale={locale}
                  submitLabel={t('cust.save')}
                  ariaLabel={t('plan.setTarget')}
                  className="flex flex-col gap-3"
                >
                  {branch ? <input type="hidden" name="branchId" value={branch} /> : null}
                  <p className="text-sm text-[var(--color-text-muted)]">
                    {branch ? branches.find((b) => b.id === branch)?.label : t('plan.wholeCompany')}
                  </p>
                  <label className={fieldLabel}>
                    {t('plan.month')}
                    <input
                      type="month"
                      name="month"
                      required
                      defaultValue={year === thisYear ? thisMonth : `${year}-01`}
                      dir="ltr"
                      className={inputClass}
                    />
                  </label>
                  <label className={fieldLabel}>
                    {`${t('plan.target')} (${cur})`}
                    <input name="amount" inputMode="decimal" dir="ltr" className={inputClass} />
                  </label>
                  <p className="text-xs text-[var(--color-text-muted)]">{t('plan.targetHelp')}</p>
                </InlineForm>
                {res.data.targets.filter((x) => x.branchId === (branch ?? null)).length ? (
                  <ul className="mt-5 flex flex-col gap-2 border-t border-[var(--color-border)] pt-4 text-sm">
                    {res.data.targets
                      .filter((x) => x.branchId === (branch ?? null))
                      .map((x) => (
                        <li
                          key={x.id}
                          className="flex flex-wrap items-center justify-between gap-2"
                          data-target={x.month}
                        >
                          <span>
                            <Ltr>{x.month}</Ltr> · <Ltr>{`${groupDigits(x.amount)} ${cur}`}</Ltr>
                          </span>
                          <span className="flex gap-2">
                            <InlineForm
                              action={act({ kind: 'set', back: here })}
                              locale={locale}
                              submitLabel={t('cust.save')}
                              submitClassName={buttonSecondary}
                              ariaLabel={`${t('plan.changeTarget')} ${x.month}`}
                              className="flex items-end gap-2"
                            >
                              <input type="hidden" name="month" value={x.month} />
                              <input type="hidden" name="version" value={x.version} />
                              {branch ? <input type="hidden" name="branchId" value={branch} /> : null}
                              <label className="sr-only" htmlFor={`amt-${x.id}`}>
                                {`${t('plan.target')} ${x.month}`}
                              </label>
                              <input
                                id={`amt-${x.id}`}
                                name="amount"
                                defaultValue={x.amount}
                                inputMode="decimal"
                                dir="ltr"
                                className={`${inputClass} w-28`}
                              />
                            </InlineForm>
                            <InlineForm
                              action={act({ kind: 'remove', targetId: x.id, back: here })}
                              locale={locale}
                              submitLabel={t('plan.remove')}
                              submitClassName={buttonSecondary}
                              ariaLabel={`${t('plan.remove')} ${x.month}`}
                            />
                          </span>
                        </li>
                      ))}
                  </ul>
                ) : null}
              </Card>
            ) : null
          }
        />
      )}
    </>
  );
}
