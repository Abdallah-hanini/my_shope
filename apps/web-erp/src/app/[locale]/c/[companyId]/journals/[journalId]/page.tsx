import { unwrap } from '@erp/api-client';
import { createTranslator, formatDateTime, isLocale } from '@erp/localization';
import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProblemNotice } from '@/components/ProblemNotice';
import { SimpleForm } from '@/components/SimpleForm';
import { Card, Ltr, PageHeader, Table, td, th, thNum } from '@/components/ui';
import { attempt } from '@/lib/api';
import { loadCompany, localName } from '@/lib/context';
import { reverseJournalAction } from '../../actions';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function JournalPage({
  params,
}: {
  params: Promise<{ locale: string; companyId: string; journalId: string }>;
}) {
  const { locale, companyId, journalId } = await params;
  if (!isLocale(locale) || !UUID.test(journalId)) notFound();
  const t = createTranslator(locale);
  const ctx = await loadCompany(companyId);
  if (!ctx.ok) return null;
  const { api, can, company } = ctx.data;
  const [journal, accounts] = await Promise.all([
    attempt(async () =>
      unwrap(
        await api.GET('/api/v1/companies/{companyId}/journals/{journalId}', {
          params: { path: { companyId, journalId } },
        }),
      ),
    ),
    attempt(async () =>
      unwrap(await api.GET('/api/v1/companies/{companyId}/accounts', { params: { path: { companyId } } })),
    ),
  ]);
  if (!journal.ok) {
    if (journal.status === 404) notFound();
    return <ProblemNotice result={journal} locale={locale} />;
  }
  const j = journal.data;
  const names = new Map((accounts.ok ? accounts.data : []).map((a) => [a.id, localName(a, locale)]));
  const base = `/${locale}/c/${companyId}/journals`;
  const reversible = can('accounting.journal.reverse') && j.sourceType === 'manual' && !j.reversedById;
  return (
    <>
      <PageHeader title={j.number}>
        <Link href={base} className="underline">
          {t('common.back')}
        </Link>
      </PageHeader>
      <Card>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-[max-content_1fr]">
          <dt className="font-semibold">{t('journal.postingDate')}</dt>
          <dd>
            <Ltr>{j.postingDate}</Ltr>
          </dd>
          <dt className="font-semibold">{t('common.description')}</dt>
          <dd>{j.description}</dd>
          <dt className="font-semibold">{t('journal.source')}</dt>
          <dd>{t(j.sourceType === 'reversal' ? 'journal.source.reversal' : 'journal.source.manual')}</dd>
          {j.reversalOfId ? (
            <>
              <dt className="font-semibold">{t('journal.reversalOf')}</dt>
              <dd>
                <Link href={`${base}/${j.reversalOfId}`} className="underline">
                  {t('common.view')}
                </Link>
              </dd>
            </>
          ) : null}
          {j.reversedById ? (
            <>
              <dt className="font-semibold">{t('journal.reversedBy')}</dt>
              <dd>
                <Link href={`${base}/${j.reversedById}`} className="underline">
                  {t('common.view')}
                </Link>
              </dd>
            </>
          ) : null}
          <dt className="font-semibold">{t('journal.postedAt')}</dt>
          <dd>{formatDateTime(locale, j.postedAt, company.timezone)}</dd>
        </dl>
      </Card>
      <Card title={t('journal.lines')} id="lines">
        <Table caption={t('journal.lines')}>
          <thead>
            <tr>
              <th scope="col" className={th}>
                #
              </th>
              <th scope="col" className={th}>
                {t('journal.account')}
              </th>
              <th scope="col" className={th}>
                {t('common.description')}
              </th>
              <th scope="col" className={thNum}>
                {t('journal.debit')}
              </th>
              <th scope="col" className={thNum}>
                {t('journal.credit')}
              </th>
            </tr>
          </thead>
          <tbody>
            {j.lines.map((l) => (
              <tr key={l.lineNo}>
                <td className={td}>{l.lineNo}</td>
                <td className={td}>
                  <Ltr>{l.accountCode}</Ltr> {names.get(l.accountId) ?? ''}
                </td>
                <td className={td}>{l.description ?? ''}</td>
                <td className={`${td} text-end`}>
                  <Ltr>{l.debit}</Ltr>
                </td>
                <td className={`${td} text-end`}>
                  <Ltr>{l.credit}</Ltr>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={3} className={thNum}>
                {t('common.total')} (<Ltr>{j.currency}</Ltr>)
              </th>
              <td className={`${td} text-end font-semibold`}>
                <Ltr>{j.totalDebit}</Ltr>
              </td>
              <td className={`${td} text-end font-semibold`}>
                <Ltr>{j.totalCredit}</Ltr>
              </td>
            </tr>
          </tfoot>
        </Table>
        <p className="mt-3 text-sm text-[var(--color-text-muted)]">{t('journal.immutable')}</p>
      </Card>
      {reversible ? (
        <Card title={t('journal.reverse')} id="reverse">
          <p className="mb-3">{t('journal.reverseHelp')}</p>
          <SimpleForm
            locale={locale}
            idPrefix="reverse"
            action={reverseJournalAction.bind(null, locale, companyId, j.id)}
            submitLabel={t('journal.reverse')}
            hidden={{ idempotencyKey: randomUUID() }}
            fields={[
              {
                name: 'postingDate',
                label: t('journal.postingDate'),
                type: 'date',
                required: true,
                defaultValue: j.postingDate,
              },
              { name: 'reason', label: t('common.reason'), required: true, maxLength: 500 },
            ]}
          />
        </Card>
      ) : null}
    </>
  );
}
