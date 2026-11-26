import { unwrap, type LabourReport } from '@erp/api-client';
import { createTranslator, formatDateTime, isLocale, type Locale } from '@erp/localization';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProblemNotice } from '@/components/ProblemNotice';
import { LedgerFilters } from '@/components/reports/LedgerParts';
import { Card, EmptyState, Ltr, PageHeader, Table, td, tdNum, th, thNum } from '@/components/ui';
import { attempt } from '@/lib/api';
import { loadCompany, localName } from '@/lib/context';
import { ledgerRange } from '@/lib/ledger';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** WEB-023 labour time report (definitions: docs/KPI_DICTIONARY.md "Labour time"). */
export default async function LabourTimePage({
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
  const { from, to } = ledgerRange(company.timezone, sp);
  const branch = sp.branch && UUID.test(sp.branch) ? sp.branch : undefined;
  const base = `/${locale}/c/${companyId}`;
  const [report, branches] = await Promise.all([
    attempt(async () =>
      unwrap(
        await api.GET('/api/v1/companies/{companyId}/labour-time', {
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
  return (
    <>
      <PageHeader title={t('labour.report')}>
        {report.ok ? (
          <span>
            {t('labour.asOf')}{' '}
            <time dateTime={report.data.asOf}>
              {formatDateTime(locale, report.data.asOf, company.timezone)}
            </time>
          </span>
        ) : null}
      </PageHeader>
      <LedgerFilters
        locale={locale}
        action={`${base}/labour-time`}
        timeZone={company.timezone}
        from={from}
        to={to}
        branch={branch}
        branches={
          branches.ok
            ? branches.data.map((b) => ({ id: b.id, label: `${b.code} — ${localName(b, locale)}` }))
            : []
        }
      />
      {!report.ok ? (
        <ProblemNotice result={report} locale={locale} />
      ) : (
        <ReportBody r={report.data} locale={locale} base={base} timeZone={company.timezone} />
      )}
    </>
  );
}

function ReportBody({
  r,
  locale,
  base,
  timeZone,
}: {
  r: LabourReport;
  locale: Locale;
  base: string;
  timeZone: string;
}) {
  const t = createTranslator(locale);
  const pct = (v: string | null | undefined) =>
    v === null ? (
      <span className="text-[var(--color-text-muted)]">{t('labour.noTime')}</span>
    ) : (
      <Ltr>{v} %</Ltr>
    );
  const cols = [
    t('labour.clocked'),
    t('labour.jobs'),
    t('labour.tasksDone'),
    t('labour.withoutTime'),
    t('labour.estimated'),
    t('labour.actualOnDone'),
    t('labour.efficiency'),
  ];
  const cells = (x: LabourReport['totals']) => (
    <>
      <td className={tdNum}>
        <Ltr>{x.clockedHours}</Ltr>
      </td>
      <td className={tdNum}>
        <Ltr>{x.jobs}</Ltr>
      </td>
      <td className={tdNum}>
        <Ltr>{x.tasksDone}</Ltr>
      </td>
      <td className={tdNum}>
        <Ltr>{x.tasksWithoutTime}</Ltr>
      </td>
      <td className={tdNum}>
        <Ltr>{x.estimatedHours}</Ltr>
      </td>
      <td className={tdNum}>
        <Ltr>{x.actualHours}</Ltr>
      </td>
      <td className={tdNum}>{pct(x.efficiencyPct)}</td>
    </>
  );
  return (
    <>
      <p className="mb-4 text-sm text-[var(--color-text-muted)]">
        {t('labour.reportHelp')} {t('labour.efficiencyHelp')}
      </p>
      {r.rows.length === 0 ? (
        <EmptyState>{t('labour.nobody')}</EmptyState>
      ) : (
        <Card title={t('labour.report')} flush>
          <Table caption={t('labour.report')}>
            <thead>
              <tr>
                <th scope="col" className={th}>
                  {t('labour.technician')}
                </th>
                {cols.map((c) => (
                  <th key={c} scope="col" className={thNum}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {r.rows.map((x) => (
                <tr key={x.technicianId} data-technician={x.technicianName}>
                  <th scope="row" className={`${td} text-start font-medium`}>
                    {x.technicianName}
                  </th>
                  {cells(x)}
                </tr>
              ))}
            </tbody>
            <tfoot className="font-semibold">
              <tr>
                <th scope="row" className={`${td} text-start`}>
                  {t('labour.total')}
                </th>
                {cells(r.totals)}
              </tr>
            </tfoot>
          </Table>
        </Card>
      )}
      {r.clockedOnNow.length ? (
        <Card title={t('labour.onNow')}>
          <ul className="flex flex-col gap-2 text-sm">
            {r.clockedOnNow.map((o) => (
              <li key={`${o.jobId}-${o.since}`}>
                <span className="font-medium">{o.technicianName}</span> ·{' '}
                <Link href={`${base}/jobs/${o.jobId}`} className="hover:underline">
                  {o.jobNumber}
                </Link>{' '}
                · {o.taskDescription} · {t('labour.since')}{' '}
                <Ltr>{formatDateTime(locale, o.since, timeZone)}</Ltr>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}
