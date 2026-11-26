import { unwrap } from '@erp/api-client';
import { createTranslator, isLocale } from '@erp/localization';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { RoleForm } from '@/components/access/RoleForm';
import { ProblemNotice } from '@/components/ProblemNotice';
import { Badge, Card, EmptyState, Ltr, PageHeader, Table, td, tdNum, th, thNum } from '@/components/ui';
import { roleLabel } from '@/lib/access';
import { attempt } from '@/lib/api';
import { loadCompany } from '@/lib/context';
import { createRoleAction } from '../access-actions';

export default async function RolesPage({
  params,
}: {
  params: Promise<{ locale: string; companyId: string }>;
}) {
  const { locale, companyId } = await params;
  if (!isLocale(locale)) notFound();
  const t = createTranslator(locale);
  const ctx = await loadCompany(companyId);
  if (!ctx.ok) return null;
  const { api, can } = ctx.data;
  const roles = await attempt(async () =>
    unwrap(await api.GET('/api/v1/companies/{companyId}/roles', { params: { path: { companyId } } })),
  );
  const base = `/${locale}/c/${companyId}/roles`;
  return (
    <>
      <PageHeader title={t('roles.title')} />
      <Card flush>
        {!roles.ok ? (
          <div className="p-5">
            <ProblemNotice result={roles} locale={locale} />
          </div>
        ) : roles.data.length === 0 ? (
          <EmptyState>{t('roles.empty')}</EmptyState>
        ) : (
          <Table caption={t('roles.title')}>
            <thead>
              <tr>
                <th scope="col" className={th}>
                  {t('common.name')}
                </th>
                <th scope="col" className={th}>
                  {t('common.code')}
                </th>
                <th scope="col" className={thNum}>
                  {t('roles.permissions')}
                </th>
                <th scope="col" className={thNum}>
                  {t('roles.members')}
                </th>
              </tr>
            </thead>
            <tbody>
              {roles.data.map((r) => (
                <tr key={r.id}>
                  <th scope="row" className={`${td} text-start font-medium`}>
                    <Link href={`${base}/${r.id}`} className="text-[var(--color-primary)] hover:underline">
                      {roleLabel(r, locale)}
                    </Link>
                    {r.isSystem ? (
                      <span className="ms-2">
                        <Badge>{t('roles.system')}</Badge>
                      </span>
                    ) : null}
                  </th>
                  <td className={td}>
                    <Ltr>{r.code}</Ltr>
                  </td>
                  <td className={tdNum}>{r.permissions.length}</td>
                  <td className={tdNum}>{r.memberCount}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {can('iam.role.manage') ? (
        <Card title={t('roles.new')} id="new-role">
          <RoleForm locale={locale} mode="create" action={createRoleAction.bind(null, locale, companyId)} />
        </Card>
      ) : null}
    </>
  );
}
