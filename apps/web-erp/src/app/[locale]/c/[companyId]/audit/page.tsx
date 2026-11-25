import { unwrap } from '@erp/api-client';
import { createTranslator, formatDateTime, isLocale } from '@erp/localization';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProblemNotice } from '@/components/ProblemNotice';
import { buttonSecondary, Card, EmptyState, Ltr, PageHeader, Table, td, th } from '@/components/ui';
import { attempt } from '@/lib/api';
import { loadCompany } from '@/lib/context';

export default async function AuditPage({
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
  const { api, company, me } = ctx.data;
  const base = `/${locale}/c/${companyId}/audit`;
  const page = await attempt(async () =>
    unwrap(
      await api.GET('/api/v1/companies/{companyId}/audit-events', {
        params: { path: { companyId }, query: { limit: 50, ...(cursor ? { cursor } : {}) } },
      }),
    ),
  );
  return (
    <>
      <PageHeader title={t('nav.audit')} />
      <Card>
        {!page.ok ? (
          <ProblemNotice result={page} locale={locale} />
        ) : page.data.items.length === 0 ? (
          <EmptyState>{t('audit.empty')}</EmptyState>
        ) : (
          <Table caption={t('nav.audit')}>
            <thead>
              <tr>
                <th scope="col" className={th}>
                  {t('audit.when')}
                </th>
                <th scope="col" className={th}>
                  {t('audit.action')}
                </th>
                <th scope="col" className={th}>
                  {t('audit.entity')}
                </th>
                <th scope="col" className={th}>
                  {t('audit.actor')}
                </th>
                <th scope="col" className={th}>
                  {t('common.reason')}
                </th>
              </tr>
            </thead>
            <tbody>
              {page.data.items.map((e) => (
                <tr key={e.id}>
                  <td className={td}>{formatDateTime(locale, e.occurredAt, company.timezone)}</td>
                  <td className={td}>
                    <Ltr>{e.action}</Ltr>
                  </td>
                  <td className={td}>
                    <Ltr>
                      {e.entityType} {e.entityId.slice(0, 8)}
                    </Ltr>
                  </td>
                  <td className={td}>
                    {e.actorUserId === me.user.id ? (
                      me.user.displayName
                    ) : (
                      <Ltr>{e.actorUserId?.slice(0, 8) ?? '—'}</Ltr>
                    )}
                  </td>
                  <td className={td}>{e.reason ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {page.ok && (cursor || page.data.nextCursor) ? (
          <nav className="mt-4 flex gap-2" aria-label={t('nav.audit')}>
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
