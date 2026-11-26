import { unwrap } from '@erp/api-client';
import { createTranslator, isLocale } from '@erp/localization';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionButton } from '@/components/access/ActionButton';
import { ProblemNotice } from '@/components/ProblemNotice';
import { SimpleForm } from '@/components/SimpleForm';
import { Badge, buttonSecondary, Card, Notice, PageHeader } from '@/components/ui';
import { branchLabel, roleLabel } from '@/lib/access';
import { attempt } from '@/lib/api';
import { loadCompany } from '@/lib/context';
import {
  assignRoleAction,
  resetPasswordAction,
  revokeAssignmentAction,
  setUserStatusAction,
} from '../../access-actions';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function UserPage({
  params,
}: {
  params: Promise<{ locale: string; companyId: string; userId: string }>;
}) {
  const { locale, companyId, userId } = await params;
  if (!isLocale(locale) || !UUID.test(userId)) notFound();
  const t = createTranslator(locale);
  const ctx = await loadCompany(companyId);
  if (!ctx.ok) return null;
  const { api, can, me } = ctx.data;
  const path = { params: { path: { companyId } } };
  const [user, roles, branches] = await Promise.all([
    attempt(async () =>
      unwrap(
        await api.GET('/api/v1/companies/{companyId}/users/{userId}', {
          params: { path: { companyId, userId } },
        }),
      ),
    ),
    can('iam.role.read')
      ? attempt(async () => unwrap(await api.GET('/api/v1/companies/{companyId}/roles', path)))
      : Promise.resolve({ ok: true as const, data: [] }),
    can('org.branch.read')
      ? attempt(async () => unwrap(await api.GET('/api/v1/companies/{companyId}/branches', path)))
      : Promise.resolve({ ok: true as const, data: [] }),
  ]);
  if (!user.ok) {
    if (user.status === 404) notFound();
    return <ProblemNotice result={user} locale={locale} />;
  }
  const u = user.data;
  const self = u.id === me.user.id;
  const branchList = branches.ok ? branches.data : [];
  const myAssignments = me.companies.find((c) => c.companyId === companyId)?.assignments ?? [];
  const companyWide = myAssignments.some((a) => a.branchId === null);
  const scopeBranches = companyWide
    ? branchList
    : branchList.filter((b) => myAssignments.some((a) => a.branchId === b.id));
  const base = `/${locale}/c/${companyId}/users`;

  return (
    <>
      <PageHeader title={u.displayName}>
        <span dir="ltr">{u.email}</span>
        <span className="ms-3 inline-flex flex-wrap gap-1.5 align-middle">
          {u.status === 'active' ? (
            <Badge tone="success">{t('users.statusActive')}</Badge>
          ) : (
            <Badge tone="danger">{t('users.statusInactive')}</Badge>
          )}
          {self ? <Badge tone="info">{t('users.you')}</Badge> : null}
          {u.isPlatformAdmin ? <Badge>{t('users.platformAdmin')}</Badge> : null}
          {u.inOtherCompanies ? <Badge tone="warning">{t('users.otherCompanies')}</Badge> : null}
        </span>
      </PageHeader>
      <p className="-mt-4 mb-6">
        <Link href={base} className="text-sm font-medium text-[var(--color-primary)] hover:underline">
          {t('common.back')}
        </Link>
      </p>

      <Card title={t('users.access')} id="access">
        <ul className="flex flex-col divide-y divide-[var(--color-border)]">
          {u.assignments.map((a) => (
            <li key={a.assignmentId} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <span>
                <span className="font-medium">
                  {roleLabel({ name: a.roleName, nameAr: a.roleNameAr, code: a.roleCode }, locale)}
                </span>
                <span className="ms-2 text-sm text-[var(--color-text-muted)]">
                  {branchLabel(branchList, a.branchId ?? null, locale, t('common.allBranches'))}
                </span>
              </span>
              {can('iam.assignment.manage') && !self ? (
                <ActionButton
                  locale={locale}
                  label={t('users.remove')}
                  className={buttonSecondary}
                  action={revokeAssignmentAction.bind(null, locale, companyId, u.id, a.assignmentId)}
                />
              ) : null}
            </li>
          ))}
        </ul>
        {can('iam.assignment.manage') && roles.ok && roles.data.length ? (
          <div className="mt-5 border-t border-[var(--color-border)] pt-5">
            <h3 className="mb-3 text-sm font-semibold">{t('users.giveRole')}</h3>
            <SimpleForm
              locale={locale}
              idPrefix="assign"
              columns={2}
              action={assignRoleAction.bind(null, locale, companyId, u.id)}
              submitLabel={t('users.giveRole')}
              fields={[
                {
                  name: 'roleId',
                  label: t('users.role'),
                  type: 'select',
                  required: true,
                  options: roles.data.map((r) => ({ value: r.id, label: roleLabel(r, locale) })),
                },
                {
                  name: 'branchId',
                  label: t('users.branch'),
                  type: 'select',
                  options: [
                    ...(companyWide ? [{ value: '', label: t('common.allBranches') }] : []),
                    ...scopeBranches.map((b) => ({
                      value: b.id,
                      label: branchLabel(branchList, b.id, locale, ''),
                    })),
                  ],
                },
              ]}
            />
          </div>
        ) : null}
      </Card>

      {can('iam.user.manage') ? (
        <Card title={t('users.account')} id="account">
          {self ? (
            <Notice>{t('users.selfNote')}</Notice>
          ) : (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <section aria-labelledby="reset-title" className="flex flex-col gap-2">
                <h3 id="reset-title" className="text-sm font-semibold">
                  {t('users.resetPassword')}
                </h3>
                <p className="text-sm text-[var(--color-text-muted)]">{t('users.resetHelp')}</p>
                <ActionButton
                  locale={locale}
                  label={t('users.resetPassword')}
                  className={buttonSecondary}
                  secretTitle={t('users.resetPassword')}
                  action={resetPasswordAction.bind(null, locale, companyId, u.id)}
                />
              </section>
              <section aria-labelledby="status-title" className="flex flex-col gap-2">
                <h3 id="status-title" className="text-sm font-semibold">
                  {u.status === 'active' ? t('users.deactivate') : t('users.reactivate')}
                </h3>
                {u.status === 'active' ? (
                  <p className="text-sm text-[var(--color-text-muted)]">{t('users.deactivateHelp')}</p>
                ) : null}
                <SimpleForm
                  locale={locale}
                  idPrefix="status"
                  columns={1}
                  action={setUserStatusAction.bind(
                    null,
                    locale,
                    companyId,
                    u.id,
                    u.status === 'active' ? 'inactive' : 'active',
                  )}
                  submitLabel={u.status === 'active' ? t('users.deactivate') : t('users.reactivate')}
                  fields={[{ name: 'reason', label: t('common.reason'), required: true, maxLength: 500 }]}
                />
              </section>
            </div>
          )}
        </Card>
      ) : null}
    </>
  );
}
