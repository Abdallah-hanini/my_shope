import { unwrap } from '@erp/api-client';
import { createTranslator, groupDigits, isLocale } from '@erp/localization';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProblemNotice } from '@/components/ProblemNotice';
import {
  buttonPrimary,
  buttonSecondary,
  Card,
  EmptyState,
  Ltr,
  PageHeader,
  Table,
  td,
  th,
  thNum,
} from '@/components/ui';
import { attempt } from '@/lib/api';
import { loadCompany } from '@/lib/context';

export default async function JournalsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; companyId: string }>;
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { locale, companyId } = await params;
  const { cursor } = await searchParams;
  if (!isLocale(locale)) notFound();
  const t = createTranslator(locale);
  const ctx = await loadCompany(companyId);
  if (!ctx.ok) return null;
  const { api, can } = ctx.data;
  const base = `/${locale}/c/${companyId}/journals`;
  const page = await attempt(async () =>
    unwrap(
      await api.GET('/api/v1/companies/{companyId}/journals', {
        params: { path: { companyId }, query: { limit: 25, ...(cursor ? { cursor } : {}) } },
      }),
    ),
  );
  return (
    <>
      <PageHeader
        title={t('nav.journals')}
        actions={
          can('accounting.journal.post') ? (
            <Link href={`${base}/new`} className={buttonPrimary}>
              {t('journal.new')}
            </Link>
          ) : null
        }
      />
      <Card>
        {!page.ok ? (
          <ProblemNotice result={page} locale={locale} />
        ) : page.data.items.length === 0 ? (
          <EmptyState>{t('journal.empty')}</EmptyState>
        ) : (
          <Table caption={t('nav.journals')}>
            <thead>
              <tr>
                <th scope="col" className={th}>
                  {t('journal.number')}
                </th>
                <th scope="col" className={th}>
                  {t('journal.postingDate')}
                </th>
                <th scope="col" className={th}>
                  {t('common.description')}
                </th>
                <th scope="col" className={thNum}>
                  {t('common.total')}
                </th>
                <th scope="col" className={th}>
                  {t('journal.source')}
                </th>
              </tr>
            </thead>
            <tbody>
              {page.data.items.map((j) => (
                <tr key={j.id}>
                  <td className={td}>
                    <Link href={`${base}/${j.id}`} className="font-semibold underline">
                      <Ltr className="whitespace-nowrap">{j.number}</Ltr>
                    </Link>
                  </td>
                  <td className={`${td} whitespace-nowrap`}>
                    <Ltr>{j.postingDate}</Ltr>
                  </td>
                  <td className={td}>{j.description}</td>
                  <td className={`${td} text-end`}>
                    <Ltr className="whitespace-nowrap">
                      {groupDigits(j.totalDebit)} {j.currency}
                    </Ltr>
                  </td>
                  <td className={td}>
                    {t(j.sourceType === 'reversal' ? 'journal.source.reversal' : 'journal.source.manual')}
                    {j.reversedById ? <> · {t('journal.reversedBy')}</> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {page.ok && (cursor || page.data.nextCursor) ? (
          <nav className="mt-4 flex gap-2" aria-label={t('nav.journals')}>
            {cursor ? (
              <Link href={base} className={buttonSecondary}>
                {t('common.first')}
              </Link>
            ) : null}
            {page.data.nextCursor ? (
              <Link
                href={`${base}?cursor=${encodeURIComponent(page.data.nextCursor)}`}
                className={buttonSecondary}
              >
                {t('common.next')}
              </Link>
            ) : null}
          </nav>
        ) : null}
      </Card>
    </>
  );
}
