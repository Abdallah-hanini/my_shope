import { unwrap } from '@erp/api-client';
import { createTranslator, isLocale, type MessageKey } from '@erp/localization';
import { accountReportingClasses, accountTypes } from '@erp/validation';
import { notFound } from 'next/navigation';
import { ProblemNotice } from '@/components/ProblemNotice';
import { SimpleForm } from '@/components/SimpleForm';
import { Badge, Card, EmptyState, Ltr, PageHeader, Table, td, th } from '@/components/ui';
import { accountLabel, accountTree } from '@/lib/accounts';
import { attempt } from '@/lib/api';
import { loadCompany, localName } from '@/lib/context';
import { createAccountAction } from '../actions';

export default async function AccountsPage({
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
  const accounts = await attempt(async () =>
    unwrap(await api.GET('/api/v1/companies/{companyId}/accounts', { params: { path: { companyId } } })),
  );
  const typeLabel = (type: string) => t(`account.type.${type}` as MessageKey);
  const headers = accounts.ok ? accounts.data.filter((a) => !a.isPosting) : [];
  return (
    <>
      <PageHeader title={t('nav.accounts')} />
      {can('accounting.account.manage') ? (
        <Card title={t('account.new')} id="new-account">
          <SimpleForm
            locale={locale}
            idPrefix="account"
            action={createAccountAction.bind(null, locale, companyId)}
            submitLabel={t('common.create')}
            columns={3}
            fields={[
              { name: 'code', label: t('common.code'), required: true, maxLength: 32, dir: 'ltr' },
              { name: 'name', label: t('common.name'), required: true, maxLength: 200 },
              { name: 'nameAr', label: t('common.nameAr'), maxLength: 200, dir: 'rtl' },
              {
                name: 'type',
                label: t('account.type'),
                type: 'select',
                required: true,
                options: accountTypes.map((a) => ({ value: a, label: typeLabel(a) })),
              },
              {
                name: 'kind',
                label: t('account.kind'),
                type: 'select',
                required: true,
                hint: t('account.kindHelp'),
                options: [
                  { value: 'posting', label: t('account.posting') },
                  { value: 'header', label: t('account.header') },
                ],
              },
              {
                name: 'reportingClass',
                label: t('account.reportingClass'),
                type: 'select',
                hint: t('account.reportingClassHelp'),
                options: [
                  { value: '', label: t('account.class.none') },
                  ...accountReportingClasses.map((c) => ({
                    value: c,
                    label: t(`account.class.${c}` as MessageKey),
                  })),
                ],
              },
              {
                name: 'parentId',
                label: t('account.parent'),
                type: 'select',
                options: [
                  { value: '', label: '—' },
                  ...headers.map((h) => ({ value: h.id, label: accountLabel(h, locale) })),
                ],
              },
            ]}
          />
        </Card>
      ) : null}
      <Card>
        {!accounts.ok ? (
          <ProblemNotice result={accounts} locale={locale} />
        ) : accounts.data.length === 0 ? (
          <EmptyState>{t('account.empty')}</EmptyState>
        ) : (
          <Table caption={t('nav.accounts')}>
            <thead>
              <tr>
                <th scope="col" className={th}>
                  {t('common.code')}
                </th>
                <th scope="col" className={th}>
                  {t('common.name')}
                </th>
                <th scope="col" className={th}>
                  {t('account.type')}
                </th>
                <th scope="col" className={th}>
                  {t('account.kind')}
                </th>
                <th scope="col" className={th}>
                  {t('account.reportingClass')}
                </th>
              </tr>
            </thead>
            <tbody>
              {accountTree(accounts.data).map(({ account: a, depth }) => (
                <tr key={a.id}>
                  <td className={td}>
                    <span style={{ paddingInlineStart: `${depth * 1.25}rem` }}>
                      <Ltr className={a.isPosting ? '' : 'font-semibold'}>{a.code}</Ltr>
                    </span>
                  </td>
                  <td className={`${td} ${a.isPosting ? '' : 'font-semibold'}`}>{localName(a, locale)}</td>
                  <td className={td}>{typeLabel(a.type)}</td>
                  <td className={td}>{t(a.isPosting ? 'account.posting' : 'account.header')}</td>
                  <td className={td}>
                    {a.reportingClass ? (
                      <Badge tone="info">{t(`account.class.${a.reportingClass}` as MessageKey)}</Badge>
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
