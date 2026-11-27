import { unwrap } from '@erp/api-client';
import { createTranslator, isLocale } from '@erp/localization';
import { Building2 } from 'lucide-react';
import { notFound } from 'next/navigation';
import { ProblemNotice } from '@/components/ProblemNotice';
import { SimpleForm } from '@/components/SimpleForm';
import { Card, EmptyState, Ltr, PageHeader, Table, td, th, JumpAction } from '@/components/ui';
import { attempt } from '@/lib/api';
import { loadCompany, localName } from '@/lib/context';
import { createBranchAction } from '../actions';

export default async function BranchesPage({
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
  const branches = await attempt(async () =>
    unwrap(await api.GET('/api/v1/companies/{companyId}/branches', { params: { path: { companyId } } })),
  );
  return (
    <>
      <PageHeader
        title={t('nav.branches')}
        actions={can('org.branch.manage') ? <JumpAction href="#new-branch" label={t('branch.new')} /> : null}
      />
      <Card>
        {!branches.ok ? (
          <ProblemNotice result={branches} locale={locale} />
        ) : branches.data.length === 0 ? (
          <EmptyState icon={<Building2 aria-hidden size={18} />}>{t('branch.empty')}</EmptyState>
        ) : (
          <Table caption={t('nav.branches')}>
            <thead>
              <tr>
                <th scope="col" className={th}>
                  {t('common.code')}
                </th>
                <th scope="col" className={th}>
                  {t('common.name')}
                </th>
                <th scope="col" className={th}>
                  {t('common.status')}
                </th>
              </tr>
            </thead>
            <tbody>
              {branches.data.map((b) => (
                <tr key={b.id}>
                  <td className={td}>
                    <Ltr>{b.code}</Ltr>
                  </td>
                  <td className={td}>{localName(b, locale)}</td>
                  <td className={td}>{t(b.status === 'active' ? 'common.active' : 'common.inactive')}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {can('org.branch.manage') ? (
        <Card title={t('branch.new')} id="new-branch">
          <SimpleForm
            locale={locale}
            idPrefix="branch"
            action={createBranchAction.bind(null, locale, companyId)}
            submitLabel={t('common.create')}
            columns={3}
            fields={[
              { name: 'code', label: t('common.code'), required: true, maxLength: 32, dir: 'ltr' },
              { name: 'name', label: t('common.name'), required: true, maxLength: 200 },
              { name: 'nameAr', label: t('common.nameAr'), maxLength: 200, dir: 'rtl' },
            ]}
          />
        </Card>
      ) : null}
    </>
  );
}
