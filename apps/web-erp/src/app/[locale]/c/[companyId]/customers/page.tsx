import { unwrap } from '@erp/api-client';
import { createTranslator, isLocale, type MessageKey } from '@erp/localization';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProblemNotice } from '@/components/ProblemNotice';
import { SimpleForm } from '@/components/SimpleForm';
import {
  buttonSecondary,
  Card,
  EmptyState,
  inputClass,
  Ltr,
  PageHeader,
  Table,
  td,
  tdNum,
  th,
  thNum,
} from '@/components/ui';
import { attempt } from '@/lib/api';
import { loadCompany, localName } from '@/lib/context';
import { createCustomerAction } from '../workshop-actions';

/** Customers (WMS-001, CRM-001). */
export default async function CustomersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; companyId: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { locale, companyId } = await params;
  const q = ((await searchParams).q ?? '').slice(0, 100);
  if (!isLocale(locale)) notFound();
  const t = createTranslator(locale);
  const ctx = await loadCompany(companyId);
  if (!ctx.ok) return null;
  const { api, can } = ctx.data;
  const list = await attempt(async () =>
    unwrap(
      await api.GET('/api/v1/companies/{companyId}/customers', {
        params: { path: { companyId }, query: q ? { q } : {} },
      }),
    ),
  );
  const base = `/${locale}/c/${companyId}/customers`;
  return (
    <>
      <PageHeader title={t('cust.title')} />
      <form role="search" method="get" className="mb-4 flex gap-2">
        <label htmlFor="cust-q" className="sr-only">
          {t('cust.search')}
        </label>
        <input
          id="cust-q"
          name="q"
          type="search"
          defaultValue={q}
          placeholder={t('cust.search')}
          className={`${inputClass} max-w-md`}
        />
        <button type="submit" className={buttonSecondary}>
          {t('search.button')}
        </button>
      </form>
      <Card flush>
        {!list.ok ? (
          <div className="p-5">
            <ProblemNotice result={list} locale={locale} />
          </div>
        ) : list.data.length === 0 ? (
          <EmptyState>{t('cust.empty')}</EmptyState>
        ) : (
          <Table caption={t('cust.title')}>
            <thead>
              <tr>
                <th scope="col" className={th}>
                  {t('cust.name')}
                </th>
                <th scope="col" className={th}>
                  {t('cust.phone')}
                </th>
                <th scope="col" className={th}>
                  {t('cust.kind')}
                </th>
                <th scope="col" className={thNum}>
                  {t('cust.vehicles')}
                </th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((c) => (
                <tr key={c.id}>
                  <th scope="row" className={`${td} text-start font-medium`}>
                    <Link href={`${base}/${c.id}`} className="text-[var(--color-primary)] hover:underline">
                      {localName(c, locale)}
                    </Link>
                  </th>
                  <td className={td}>
                    <Ltr>{c.phone}</Ltr>
                  </td>
                  <td className={td}>{t(`cust.kind.${c.kind}` as MessageKey)}</td>
                  <td className={tdNum}>{c.vehicleCount}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {can('crm.customer.manage') ? (
        <Card title={t('cust.new')} id="new-customer">
          <SimpleForm
            locale={locale}
            idPrefix="cust"
            columns={3}
            action={createCustomerAction.bind(null, locale, companyId)}
            submitLabel={t('cust.new')}
            fields={[
              { name: 'name', label: t('cust.name'), required: true, maxLength: 200 },
              { name: 'nameAr', label: t('cust.nameAr'), maxLength: 200, dir: 'rtl' },
              {
                name: 'phone',
                label: t('cust.phone'),
                required: true,
                type: 'tel',
                dir: 'ltr',
                maxLength: 20,
              },
              { name: 'email', label: t('cust.email'), type: 'email', dir: 'ltr', maxLength: 320 },
              {
                name: 'kind',
                label: t('cust.kind'),
                type: 'select',
                required: true,
                options: [
                  { value: 'individual', label: t('cust.kind.individual') },
                  { value: 'company', label: t('cust.kind.company') },
                ],
              },
              { name: 'notes', label: t('cust.notes'), maxLength: 1000 },
            ]}
          />
        </Card>
      ) : null}
    </>
  );
}
