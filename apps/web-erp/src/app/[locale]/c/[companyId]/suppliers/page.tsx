import { unwrap } from '@erp/api-client';
import { createTranslator, isLocale } from '@erp/localization';
import { Truck } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProblemNotice } from '@/components/ProblemNotice';
import {
  Badge,
  Card,
  EmptyState,
  Ltr,
  PageHeader,
  Table,
  td,
  tdNum,
  th,
  thNum,
  buttonSecondary,
  JumpAction,
} from '@/components/ui';
import { InlineForm } from '@/components/workshop/InlineForm';
import { attempt } from '@/lib/api';
import { loadCompany } from '@/lib/context';
import { SupplierFields } from '@/components/purchasing/SupplierFields';
import { createSupplierAction } from '../purchasing-actions';

/** Suppliers with what is owed to each (T-76). */
export default async function SuppliersPage({
  params,
}: {
  params: Promise<{ locale: string; companyId: string }>;
}) {
  const { locale, companyId } = await params;
  if (!isLocale(locale)) notFound();
  const t = createTranslator(locale);
  const ctx = await loadCompany(companyId);
  if (!ctx.ok) return null;
  const { api, company } = ctx.data;
  const res = await attempt(async () =>
    unwrap(await api.GET('/api/v1/companies/{companyId}/suppliers', { params: { path: { companyId } } })),
  );
  if (!res.ok) return <ProblemNotice result={res} locale={locale} />;
  const base = `/${locale}/c/${companyId}`;
  return (
    <>
      <PageHeader
        title={t('pur.suppliers')}
        actions={res.data.canManage ? <JumpAction href="#add-supplier" label={t('pur.addSupplier')} /> : null}
      >
        {t('pur.suppliersHelp')}
      </PageHeader>
      {res.data.suppliers.length === 0 ? (
        <EmptyState
          icon={<Truck aria-hidden size={18} />}
          action={
            res.data.canManage ? (
              <a href="#add-supplier" className={buttonSecondary}>
                {t('pur.addSupplier')}
              </a>
            ) : undefined
          }
        >
          {t('pur.noSuppliers')}
        </EmptyState>
      ) : (
        <Card title={t('pur.suppliers')} flush>
          <Table caption={t('pur.suppliers')}>
            <thead>
              <tr>
                <th scope="col" className={th}>
                  {t('bay.name')}
                </th>
                <th scope="col" className={th}>
                  {t('pur.terms')}
                </th>
                <th scope="col" className={thNum}>
                  {t('pur.owed')}
                </th>
                <th scope="col" className={thNum}>
                  {t('pur.overdue')}
                </th>
              </tr>
            </thead>
            <tbody>
              {res.data.suppliers.map((s) => (
                <tr key={s.id} data-supplier={s.name}>
                  <td className={td}>
                    <Link
                      href={`${base}/suppliers/${s.id}`}
                      className="font-medium text-[var(--color-primary)] hover:underline"
                    >
                      {locale === 'ar' && s.nameAr ? s.nameAr : s.name}
                    </Link>{' '}
                    {s.active ? null : <Badge>{t('bay.inactive')}</Badge>}
                  </td>
                  <td className={td}>{t('pur.termsDays').replace('{n}', String(s.paymentTermsDays))}</td>
                  <td className={tdNum}>
                    <Ltr>{`${s.balance} ${company.baseCurrency}`}</Ltr>
                  </td>
                  <td className={tdNum}>
                    <Ltr>{s.overdue}</Ltr>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
      {res.data.canManage ? (
        <Card title={t('pur.addSupplier')} id="add-supplier">
          <InlineForm
            action={createSupplierAction.bind(null, locale, companyId)}
            locale={locale}
            submitLabel={t('pur.addSupplier')}
            ariaLabel={t('pur.addSupplier')}
          >
            <SupplierFields t={t} />
          </InlineForm>
        </Card>
      ) : null}
    </>
  );
}
