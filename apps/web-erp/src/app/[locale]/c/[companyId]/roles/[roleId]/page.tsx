import { unwrap } from '@erp/api-client';
import { createTranslator, isLocale } from '@erp/localization';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionButton } from '@/components/access/ActionButton';
import { RoleForm } from '@/components/access/RoleForm';
import { ProblemNotice } from '@/components/ProblemNotice';
import { Badge, buttonSecondary, Card, Ltr, Notice, PageHeader } from '@/components/ui';
import { roleLabel } from '@/lib/access';
import { attempt } from '@/lib/api';
import { loadCompany } from '@/lib/context';
import { deleteRoleAction, updateRoleAction } from '../../access-actions';

export default async function RolePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; companyId: string; roleId: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { locale, companyId, roleId } = await params;
  const { saved } = await searchParams;
  if (!isLocale(locale)) notFound();
  const t = createTranslator(locale);
  const ctx = await loadCompany(companyId);
  if (!ctx.ok) return null;
  const { api, can } = ctx.data;
  const roles = await attempt(async () =>
    unwrap(await api.GET('/api/v1/companies/{companyId}/roles', { params: { path: { companyId } } })),
  );
  if (!roles.ok) return <ProblemNotice result={roles} locale={locale} />;
  const role = roles.data.find((r) => r.id === roleId);
  if (!role) notFound();
  const editable = can('iam.role.manage') && !role.isSystem;
  return (
    <>
      <PageHeader title={roleLabel(role, locale)}>
        <Ltr>{role.code}</Ltr> · {t('roles.members')}: {role.memberCount}
        {role.isSystem ? (
          <span className="ms-2">
            <Badge>{t('roles.system')}</Badge>
          </span>
        ) : null}
      </PageHeader>
      <p className="-mt-4 mb-6">
        <Link
          href={`/${locale}/c/${companyId}/roles`}
          className="text-sm font-medium text-[var(--color-primary)] hover:underline"
        >
          {t('common.back')}
        </Link>
      </p>
      {saved ? <Notice tone="success">{t('roles.save')} ✓</Notice> : null}
      {role.isSystem ? <Notice>{t('roles.systemHelp')}</Notice> : null}
      <Card title={editable ? t('roles.edit') : t('roles.permissions')} id="role">
        <RoleForm
          key={role.version}
          locale={locale}
          mode="edit"
          readOnly={!editable}
          initial={{
            code: role.code,
            name: role.name,
            nameAr: role.nameAr ?? null,
            permissions: role.permissions,
            version: role.version,
          }}
          action={updateRoleAction.bind(null, locale, companyId, role.id)}
        />
      </Card>
      {editable ? (
        <Card title={t('roles.delete')} id="delete-role">
          <p className="mb-3 text-sm text-[var(--color-text-muted)]">{t('roles.deleteHelp')}</p>
          {role.memberCount === 0 ? (
            <ActionButton
              locale={locale}
              label={t('roles.delete')}
              className={buttonSecondary}
              action={deleteRoleAction.bind(null, locale, companyId, role.id)}
            />
          ) : null}
        </Card>
      ) : null}
    </>
  );
}
