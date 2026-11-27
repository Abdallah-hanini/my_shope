import { unwrap } from '@erp/api-client';
import { createTranslator, isLocale } from '@erp/localization';
import { Users } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { StaffForm } from '@/components/access/StaffForm';
import { ProblemNotice } from '@/components/ProblemNotice';
import { Badge, Card, EmptyState, PageHeader, Table, td, th, JumpAction } from '@/components/ui';
import { branchLabel, roleLabel } from '@/lib/access';
import { attempt } from '@/lib/api';
import { loadCompany } from '@/lib/context';
import { createStaffAction } from '../access-actions';

export default async function UsersPage({
  params,
}: {
  params: Promise<{ locale: string; companyId: string }>;
}) {
  const { locale, companyId } = await params;
  if (!isLocale(locale)) notFound();
  const t = createTranslator(locale);
  const ctx = await loadCompany(companyId);
  if (!ctx.ok) return null;
  const { api, can, me } = ctx.data;
  const path = { params: { path: { companyId } } };
  const [users, roles, branches] = await Promise.all([
    attempt(async () => unwrap(await api.GET('/api/v1/companies/{companyId}/users', path))),
    can('iam.role.read')
      ? attempt(async () => unwrap(await api.GET('/api/v1/companies/{companyId}/roles', path)))
      : Promise.resolve({ ok: true as const, data: [] }),
    can('org.branch.read')
      ? attempt(async () => unwrap(await api.GET('/api/v1/companies/{companyId}/branches', path)))
      : Promise.resolve({ ok: true as const, data: [] }),
  ]);
  const base = `/${locale}/c/${companyId}/users`;
  const myAssignments = me.companies.find((c) => c.companyId === companyId)?.assignments ?? [];
  const companyWide = myAssignments.some((a) => a.branchId === null);
  const branchList = branches.ok ? branches.data : [];
  const scopeBranches = companyWide
    ? branchList
    : branchList.filter((b) => myAssignments.some((a) => a.branchId === b.id));

  return (
    <>
      <PageHeader
        title={t('users.title')}
        actions={
          can('iam.user.manage') && roles.ok ? <JumpAction href="#add-staff" label={t('users.add')} /> : null
        }
      />
      <Card flush>
        {!users.ok ? (
          <div className="p-5">
            <ProblemNotice result={users} locale={locale} />
          </div>
        ) : users.data.length === 0 ? (
          <EmptyState icon={<Users aria-hidden size={18} />}>{t('users.empty')}</EmptyState>
        ) : (
          <Table caption={t('users.title')}>
            <thead>
              <tr>
                <th scope="col" className={th}>
                  {t('common.name')}
                </th>
                <th scope="col" className={th}>
                  {t('users.email')}
                </th>
                <th scope="col" className={th}>
                  {t('users.access')}
                </th>
                <th scope="col" className={th}>
                  {t('common.status')}
                </th>
              </tr>
            </thead>
            <tbody>
              {users.data.map((u) => (
                <tr key={u.id}>
                  <th scope="row" className={`${td} text-start font-medium`}>
                    <Link href={`${base}/${u.id}`} className="text-[var(--color-primary)] hover:underline">
                      {u.displayName}
                    </Link>
                    <span className="ms-2 inline-flex gap-1">
                      {u.id === me.user.id ? <Badge tone="info">{t('users.you')}</Badge> : null}
                      {u.isPlatformAdmin ? <Badge>{t('users.platformAdmin')}</Badge> : null}
                    </span>
                  </th>
                  <td className={td}>
                    <span dir="ltr">{u.email}</span>
                  </td>
                  <td className={td}>
                    <ul className="flex flex-wrap gap-1.5">
                      {u.assignments.map((a) => (
                        <li key={a.assignmentId}>
                          <Badge tone="neutral">
                            {roleLabel({ name: a.roleName, nameAr: a.roleNameAr, code: a.roleCode }, locale)}{' '}
                            · {branchLabel(branchList, a.branchId ?? null, locale, t('common.allBranches'))}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td className={td}>
                    {u.status === 'active' ? (
                      <Badge tone="success">{t('users.statusActive')}</Badge>
                    ) : (
                      <Badge tone="danger">{t('users.statusInactive')}</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {can('iam.user.manage') && roles.ok ? (
        <Card title={t('users.add')} id="add-staff">
          <StaffForm
            locale={locale}
            action={createStaffAction.bind(null, locale, companyId)}
            roles={roles.data.map((r) => ({ id: r.id, label: roleLabel(r, locale) }))}
            branches={scopeBranches.map((b) => ({
              id: b.id,
              label: branchLabel(branchList, b.id, locale, ''),
            }))}
            allowCompanyWide={companyWide}
            usersHref={base}
          />
        </Card>
      ) : null}
    </>
  );
}
