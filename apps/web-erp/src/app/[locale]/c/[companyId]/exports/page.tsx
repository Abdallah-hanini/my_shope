import { unwrap, type ExportJob } from '@erp/api-client';
import { createTranslator, formatDateTime, isLocale, type MessageKey } from '@erp/localization';
import { Download, FileDown } from 'lucide-react';
import { notFound } from 'next/navigation';
import { ProblemNotice } from '@/components/ProblemNotice';
import { AutoRefresh } from '@/components/reports/AutoRefresh';
import { ExportForm } from '@/components/reports/ExportForm';
import {
  Badge,
  buttonPrimary,
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
import { ledgerPresets } from '@/lib/ledger';
import { requestExportAction } from '../export-actions';

type Kind = 'trial_balance' | 'general_ledger' | 'journal_lines';
const STATUS_TONE: Record<string, 'neutral' | 'success' | 'warning' | 'danger' | 'info'> = {
  queued: 'info',
  running: 'info',
  succeeded: 'success',
  failed: 'danger',
  expired: 'neutral',
};

function size(bytes: number | null): string {
  if (bytes === null) return '—';
  return bytes < 1024
    ? `${bytes} B`
    : bytes < 1048576
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / 1048576).toFixed(1)} MB`;
}

/** WEB-205 Export centre (docs/SCREEN_CONTRACTS.md). */
export default async function ExportCentrePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; companyId: string }>;
  searchParams: Promise<{ new?: string; error?: string }>;
}) {
  const { locale, companyId } = await params;
  const sp = await searchParams;
  if (!isLocale(locale)) notFound();
  const t = createTranslator(locale);
  const ctx = await loadCompany(companyId);
  if (!ctx.ok) return null;
  const { api, can, company } = ctx.data;
  const path = { params: { path: { companyId } } };
  const kinds: Kind[] = [
    ...(can('reports.financial.read') ? (['trial_balance'] as const) : []),
    ...(can('accounting.journal.read') ? (['general_ledger', 'journal_lines'] as const) : []),
  ];
  const [jobs, accounts, branches] = await Promise.all([
    attempt(async () => unwrap(await api.GET('/api/v1/companies/{companyId}/exports', path))),
    can('accounting.account.read')
      ? attempt(async () => unwrap(await api.GET('/api/v1/companies/{companyId}/accounts', path)))
      : Promise.resolve(null),
    can('org.branch.read')
      ? attempt(async () => unwrap(await api.GET('/api/v1/companies/{companyId}/branches', path)))
      : Promise.resolve(null),
  ]);
  const range = ledgerPresets(company.timezone).thisMonth;
  const active = jobs.ok && jobs.data.some((j) => j.status === 'queued' || j.status === 'running');
  const errorText: Record<string, string> = {
    '403': t('error.forbidden'),
    '404': t('error.notFound'),
    '409': t('export.queuedNote'),
    '410': `${t('export.status.expired')}.`,
  };
  const describe = (j: ExportJob) => {
    const p = j.params as { from?: string; to?: string; accountId?: string; branchId?: string };
    const account = p.accountId && accounts?.ok ? accounts.data.find((a) => a.id === p.accountId) : undefined;
    const branch = p.branchId && branches?.ok ? branches.data.find((b) => b.id === p.branchId) : undefined;
    return [
      p.from ? `${p.from} – ${p.to}` : `${t('rpt.asOf')} ${p.to}`,
      account ? `${account.code} ${localName(account, locale)}` : null,
      branch ? branch.code : null,
    ]
      .filter(Boolean)
      .join(' · ');
  };

  return (
    <>
      <AutoRefresh active={active} />
      <PageHeader title={t('export.title')}>{t('export.help')}</PageHeader>
      {sp.error ? <Notice tone="danger">{errorText[sp.error] ?? t('error.title')}</Notice> : null}
      {kinds.length ? (
        <Card title={t('export.new')} id="new-export">
          <ExportForm
            locale={locale}
            action={requestExportAction.bind(null, locale, companyId)}
            kinds={kinds}
            initial={{ kind: kinds[0]!, ...range }}
            accounts={
              accounts?.ok
                ? accounts.data
                    .filter((a) => a.isPosting)
                    .map((a) => ({ id: a.id, label: `${a.code} — ${localName(a, locale)}` }))
                : []
            }
            branches={
              branches?.ok
                ? branches.data.map((b) => ({ id: b.id, label: `${b.code} — ${localName(b, locale)}` }))
                : []
            }
          />
          <p className="mt-3 text-xs text-[var(--color-text-muted)]">{t('export.pdfNote')}</p>
        </Card>
      ) : null}
      {active ? <Notice>{t('export.queuedNote')}</Notice> : null}
      <Card title={t('export.mine')} id="my-exports" flush>
        {!jobs.ok ? (
          <div className="p-5">
            <ProblemNotice result={jobs} locale={locale} />
          </div>
        ) : jobs.data.length === 0 ? (
          <EmptyState icon={<FileDown aria-hidden size={18} />}>{t('export.empty')}</EmptyState>
        ) : (
          <Table caption={t('export.mine')}>
            <thead>
              <tr>
                <th scope="col" className={th}>
                  {t('export.kind')}
                </th>
                <th scope="col" className={th}>
                  {t('export.status')}
                </th>
                <th scope="col" className={th}>
                  {t('export.requested')}
                </th>
                <th scope="col" className={thNum}>
                  {t('export.rows')}
                </th>
                <th scope="col" className={thNum}>
                  {t('export.size')}
                </th>
                <th scope="col" className={th}>
                  {t('export.expires')}
                </th>
                <th scope="col" className={th}>
                  <span className="sr-only">{t('export.download')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {jobs.data.map((j) => (
                <tr
                  key={j.id}
                  data-export-id={j.id}
                  className={sp.new === j.id ? 'bg-[var(--color-surface-muted)]' : undefined}
                >
                  <th scope="row" className={`${td} text-start font-medium`}>
                    {t(`export.kind.${j.kind}` as MessageKey)}{' '}
                    <span className="text-xs font-normal text-[var(--color-text-muted)] uppercase">
                      {j.format}
                    </span>
                    <div className="text-xs font-normal text-[var(--color-text-muted)]">
                      <Ltr className="whitespace-nowrap">{describe(j)}</Ltr>
                    </div>
                  </th>
                  <td className={td}>
                    <Badge tone={STATUS_TONE[j.status] ?? 'neutral'}>
                      {t(`export.status.${j.status}` as MessageKey)}
                    </Badge>
                    {j.error ? (
                      <div className="mt-1 max-w-xs text-xs text-[var(--color-danger)]">{j.error}</div>
                    ) : null}
                  </td>
                  <td className={`${td} whitespace-nowrap`}>
                    {formatDateTime(locale, j.createdAt, company.timezone)}
                  </td>
                  <td className={tdNum}>{j.rowCount ?? '—'}</td>
                  <td className={tdNum}>
                    <Ltr>{size(j.sizeBytes ?? null)}</Ltr>
                  </td>
                  <td className={`${td} whitespace-nowrap`}>
                    {j.expiresAt && j.status === 'succeeded'
                      ? formatDateTime(locale, j.expiresAt, company.timezone)
                      : '—'}
                  </td>
                  <td className={td}>
                    {j.status === 'succeeded' ? (
                      // A plain link: the route handler streams the file with the session's token.
                      <a
                        href={`/${locale}/c/${companyId}/exports/${j.id}/download`}
                        className={`${buttonPrimary} min-h-9 px-3`}
                        aria-label={`${t('export.download')} ${j.fileName ?? ''}`}
                        download
                      >
                        <Download aria-hidden size={16} />
                        {t('export.download')}
                      </a>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
