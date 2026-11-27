import { unwrap } from '@erp/api-client';
import { createTranslator, isLocale } from '@erp/localization';
import { minorUnits } from '@erp/validation';
import { randomUUID } from 'node:crypto';
import { notFound } from 'next/navigation';
import { JournalForm } from '@/components/JournalForm';
import { ProblemNotice } from '@/components/ProblemNotice';
import { Card, Notice, PageHeader } from '@/components/ui';
import { accountLabel } from '@/lib/accounts';
import { attempt } from '@/lib/api';
import { loadCompany, localName } from '@/lib/context';
import { postJournalAction } from '../../actions';

/** Today's business date in the company's time zone. */
function todayIn(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export default async function NewJournalPage({
  params,
}: {
  params: Promise<{ locale: string; companyId: string }>;
}) {
  const { locale, companyId } = await params;
  if (!isLocale(locale)) notFound();
  const t = createTranslator(locale);
  const ctx = await loadCompany(companyId);
  if (!ctx.ok) return null;
  const { api, can, company, me } = ctx.data;
  if (!can('accounting.journal.post')) return <Notice tone="danger">{t('error.forbidden')}</Notice>;

  const path = { params: { path: { companyId } } };
  const [accounts, branches, periods] = await Promise.all([
    attempt(async () => unwrap(await api.GET('/api/v1/companies/{companyId}/accounts', path))),
    attempt(async () => unwrap(await api.GET('/api/v1/companies/{companyId}/branches', path))),
    attempt(async () => unwrap(await api.GET('/api/v1/companies/{companyId}/fiscal-periods', path))),
  ]);
  for (const r of [accounts, branches, periods])
    if (!r.ok) return <ProblemNotice result={r} locale={locale} />;
  if (!accounts.ok || !branches.ok || !periods.ok) return null;

  const posting = accounts.data.filter((a) => a.isPosting && a.status === 'active');
  const hasOpenPeriod = periods.data.some((p) => p.status === 'open');
  const assignments = me.companies.find((c) => c.companyId === companyId)?.assignments ?? [];
  const companyWide = assignments.some((a) => a.branchId === null);
  const allowedBranches = companyWide
    ? branches.data
    : branches.data.filter((b) => assignments.some((a) => a.branchId === b.id));

  return (
    <>
      <PageHeader
        title={t('journal.new')}
        back={{ href: `/${locale}/c/${companyId}/journals`, label: t('nav.journals') }}
      />
      {posting.length === 0 ? <Notice>{t('journal.noPostingAccounts')}</Notice> : null}
      {!hasOpenPeriod ? <Notice>{t('journal.noOpenPeriod')}</Notice> : null}
      <Card>
        <JournalForm
          locale={locale}
          action={postJournalAction.bind(null, locale, companyId)}
          accounts={posting.map((a) => ({ id: a.id, label: accountLabel(a, locale) }))}
          branches={allowedBranches
            .filter((b) => b.status === 'active')
            .map((b) => ({ id: b.id, label: `${b.code} — ${localName(b, locale)}` }))}
          allowCompanyLevel={companyWide}
          currency={company.baseCurrency}
          scale={minorUnits(company.baseCurrency)}
          idempotencyKey={randomUUID()}
          defaultDate={todayIn(company.timezone)}
        />
      </Card>
    </>
  );
}
