import { unwrap } from '@erp/api-client';
import { createTranslator, formatDateTime, isLocale, type MessageKey } from '@erp/localization';
import { CheckCircle2, ClipboardList, Clock, PackageCheck } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { PrintButton } from '@/components/PrintButton';
import { ProblemNotice } from '@/components/ProblemNotice';
import { LedgerFilters } from '@/components/reports/LedgerParts';
import { branchOptions } from '@/components/reports/Statements';
import { Badge, Card, EmptyState, Grid, Ltr, PageHeader, Table, td, tdNum, th, thNum } from '@/components/ui';
import { attempt } from '@/lib/api';
import { loadCompany } from '@/lib/context';
import { ledgerRange } from '@/lib/ledger';

const UUID = /^[0-9a-f-]{36}$/i;

/** Workshop operations (RPT-OPS-01): throughput, time to deliver, first-time right, open work now. */
export default async function OperationsReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; companyId: string }>;
  searchParams: Promise<{ from?: string; to?: string; branch?: string }>;
}) {
  const { locale, companyId } = await params;
  if (!isLocale(locale)) notFound();
  const sp = await searchParams;
  const t = createTranslator(locale);
  const ctx = await loadCompany(companyId);
  if (!ctx.ok) return null;
  const { api, can, company } = ctx.data;
  const { from, to } = ledgerRange(company.timezone, sp);
  const branch = sp.branch && UUID.test(sp.branch) ? sp.branch : undefined;
  const base = `/${locale}/c/${companyId}`;
  const [res, branches] = await Promise.all([
    attempt(async () =>
      unwrap(
        await api.GET('/api/v1/companies/{companyId}/reports/operations', {
          params: { path: { companyId }, query: { from, to, ...(branch ? { branchId: branch } : {}) } },
        }),
      ),
    ),
    branchOptions(api, can, companyId, locale),
  ]);
  const hours = (h: string | null | undefined) => (h == null ? '—' : t('rpt.hoursValue').replace('{h}', h));
  return (
    <>
      <PageHeader
        title={t('rpt.operations')}
        back={{ href: `${base}/reports`, label: t('rpt.center') }}
        actions={<PrintButton label={t('rpt.print')} />}
      >
        {res.ok ? (
          <span>
            <Ltr>{`${from} – ${to}`}</Ltr> · {t('dash.freshness')}{' '}
            <time dateTime={res.data.asOf}>{formatDateTime(locale, res.data.asOf, company.timezone)}</time>
          </span>
        ) : null}
      </PageHeader>
      <LedgerFilters
        locale={locale}
        action={`${base}/reports/operations`}
        timeZone={company.timezone}
        from={from}
        to={to}
        branch={branch}
        branches={branches}
      />
      {!res.ok ? (
        <ProblemNotice result={res} locale={locale} />
      ) : (
        <>
          <section
            aria-label={t('rpt.operations')}
            className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
          >
            <KpiCard
              label={t('rpt.jobsOpened')}
              value={String(res.data.opened)}
              icon={ClipboardList}
              sub={
                res.data.cancelled
                  ? t('rpt.cancelledN').replace('{n}', String(res.data.cancelled))
                  : undefined
              }
            />
            <KpiCard label={t('rpt.jobsDelivered')} value={String(res.data.delivered)} icon={PackageCheck} />
            <KpiCard
              label={t('rpt.timeToDeliver')}
              value={hours(res.data.averageHoursToDeliver)}
              icon={Clock}
              sub={
                res.data.medianHoursToDeliver
                  ? `${t('rpt.median')} ${hours(res.data.medianHoursToDeliver)}`
                  : undefined
              }
            />
            <KpiCard
              label={t('rpt.firstTimeRight')}
              value={res.data.firstTimeRightPct ? `${res.data.firstTimeRightPct}%` : '—'}
              icon={CheckCircle2}
              sub={t('rpt.firstTimeRightHelp')}
            />
          </section>
          <Grid cols={2}>
            <Card
              title={t('rpt.openNow')}
              id="open-now"
              flush
              actions={
                res.data.overdueNow ? (
                  <Badge tone="danger">{t('rpt.overdueN').replace('{n}', String(res.data.overdueNow))}</Badge>
                ) : undefined
              }
            >
              {res.data.openByStatus.length === 0 ? (
                <EmptyState>{t('rpt.noOpenJobs')}</EmptyState>
              ) : (
                <Table caption={t('rpt.openNow')}>
                  <thead>
                    <tr>
                      <th scope="col" className={th}>
                        {t('common.status')}
                      </th>
                      <th scope="col" className={thNum}>
                        {t('rpt.jobs')}
                      </th>
                      <th scope="col" className={thNum}>
                        {t('job.overdue')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {res.data.openByStatus.map((s) => (
                      <tr key={s.status}>
                        <td className={td}>
                          <Link href={`${base}/jobs?view=list`} className="hover:underline">
                            {t(`job.status.${s.status}` as MessageKey)}
                          </Link>
                        </td>
                        <td className={tdNum}>{s.count}</td>
                        <td className={tdNum}>{s.overdue}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>
            <Card title={t('rpt.byBranch')} id="by-branch" flush>
              {res.data.byBranch.length === 0 ? (
                <EmptyState>{t('rpt.nothing')}</EmptyState>
              ) : (
                <Table caption={t('rpt.byBranch')}>
                  <thead>
                    <tr>
                      <th scope="col" className={th}>
                        {t('common.branch')}
                      </th>
                      <th scope="col" className={thNum}>
                        {t('rpt.jobsOpened')}
                      </th>
                      <th scope="col" className={thNum}>
                        {t('rpt.jobsDelivered')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {res.data.byBranch.map((b) => (
                      <tr key={b.branchCode}>
                        <td className={td}>{b.branchCode}</td>
                        <td className={tdNum}>{b.opened}</td>
                        <td className={tdNum}>{b.delivered}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>
          </Grid>
          <p className="text-xs text-[var(--color-text-muted)]">{t('rpt.operationsNote')}</p>
        </>
      )}
    </>
  );
}
