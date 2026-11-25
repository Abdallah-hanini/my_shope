import { createTranslator, isLocale } from '@erp/localization';
import { CURRENCY_MINOR_UNITS } from '@erp/validation';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { ProblemNotice } from '@/components/ProblemNotice';
import { SimpleForm } from '@/components/SimpleForm';
import { Card, Notice, PageHeader } from '@/components/ui';
import { loadUser } from '@/lib/context';
import { createCompanyAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function NewCompanyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = createTranslator(locale);
  const user = await loadUser();
  return (
    <AppShell
      locale={locale}
      title={t('company.new')}
      titleHref={`/${locale}/companies/new`}
      userLabel={user.ok ? user.data.me.user.displayName : undefined}
    >
      {!user.ok ? (
        <ProblemNotice result={user} locale={locale} />
      ) : !user.data.me.user.isPlatformAdmin ? (
        <Notice tone="danger">{t('error.forbidden')}</Notice>
      ) : (
        <>
          <PageHeader title={t('company.new')}>{t('company.adminNote')}</PageHeader>
          <Card>
            <SimpleForm
              locale={locale}
              idPrefix="company"
              action={createCompanyAction.bind(null, locale, user.data.me.user.id)}
              submitLabel={t('company.create')}
              fields={[
                { name: 'code', label: t('common.code'), required: true, maxLength: 32, dir: 'ltr' },
                {
                  name: 'legalName',
                  label: t('company.legalName'),
                  required: true,
                  maxLength: 200,
                  dir: 'ltr',
                },
                { name: 'legalNameAr', label: t('company.legalNameAr'), maxLength: 200, dir: 'rtl' },
                {
                  name: 'baseCurrency',
                  label: t('company.baseCurrency'),
                  type: 'select',
                  required: true,
                  defaultValue: 'QAR',
                  options: Object.keys(CURRENCY_MINOR_UNITS).map((c) => ({ value: c, label: c })),
                },
                {
                  name: 'timezone',
                  label: t('company.timezone'),
                  required: true,
                  defaultValue: 'Asia/Qatar',
                  dir: 'ltr',
                },
              ]}
            />
          </Card>
        </>
      )}
    </AppShell>
  );
}
