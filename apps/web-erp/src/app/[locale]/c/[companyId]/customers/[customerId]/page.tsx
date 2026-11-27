import { unwrap } from '@erp/api-client';
import { createTranslator, isLocale } from '@erp/localization';
import { Car } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProblemNotice } from '@/components/ProblemNotice';
import { SimpleForm } from '@/components/SimpleForm';
import { Card, EmptyState, Ltr, PageHeader, Table, td, th } from '@/components/ui';
import { attempt } from '@/lib/api';
import { loadCompany, localName } from '@/lib/context';
import { createVehicleAction, updateCustomerAction } from '../../workshop-actions';

const UUID = /^[0-9a-f-]{36}$/i;

export default async function CustomerPage({
  params,
}: {
  params: Promise<{ locale: string; companyId: string; customerId: string }>;
}) {
  const { locale, companyId, customerId } = await params;
  if (!isLocale(locale) || !UUID.test(customerId)) notFound();
  const t = createTranslator(locale);
  const ctx = await loadCompany(companyId);
  if (!ctx.ok) return null;
  const { api, can } = ctx.data;
  const c = await attempt(async () =>
    unwrap(
      await api.GET('/api/v1/companies/{companyId}/customers/{customerId}', {
        params: { path: { companyId, customerId } },
      }),
    ),
  );
  if (!c.ok) {
    if (c.status === 404) notFound();
    return <ProblemNotice result={c} locale={locale} />;
  }
  const d = c.data;
  const base = `/${locale}/c/${companyId}`;
  return (
    <>
      <PageHeader title={localName(d, locale)}>
        <Ltr>{d.phone}</Ltr>
        {d.email ? (
          <>
            {' · '}
            <Ltr>{d.email}</Ltr>
          </>
        ) : null}
      </PageHeader>
      <Card title={t('cust.vehicles')} id="vehicles" flush>
        {d.vehicles.length === 0 ? (
          <EmptyState icon={<Car aria-hidden size={18} />}>{t('veh.empty')}</EmptyState>
        ) : (
          <Table caption={t('cust.vehicles')}>
            <thead>
              <tr>
                <th scope="col" className={th}>
                  {t('veh.plate')}
                </th>
                <th scope="col" className={th}>
                  {t('veh.make')}
                </th>
                <th scope="col" className={th}>
                  {t('veh.vin')}
                </th>
              </tr>
            </thead>
            <tbody>
              {d.vehicles.map((v) => (
                <tr key={v.id}>
                  <th scope="row" className={`${td} text-start font-medium`}>
                    <Link
                      href={`${base}/vehicles/${v.id}`}
                      className="text-[var(--color-primary)] hover:underline"
                    >
                      <Ltr>{v.plate}</Ltr>
                    </Link>
                  </th>
                  <td className={td}>{`${v.make} ${v.model}${v.year ? ` (${v.year})` : ''}`}</td>
                  <td className={td}>
                    <Ltr>{v.vin ?? '—'}</Ltr>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {can('crm.customer.manage') ? (
        <>
          <Card title={t('veh.new')} id="new-vehicle">
            <SimpleForm
              locale={locale}
              idPrefix="veh"
              columns={3}
              hidden={{ customerId: d.id }}
              action={createVehicleAction.bind(null, locale, companyId)}
              submitLabel={t('veh.new')}
              fields={[
                { name: 'plate', label: t('veh.plate'), required: true, maxLength: 20, dir: 'ltr' },
                { name: 'make', label: t('veh.make'), required: true, maxLength: 60 },
                { name: 'model', label: t('veh.model'), required: true, maxLength: 60 },
                { name: 'year', label: t('veh.year'), type: 'number', dir: 'ltr' },
                { name: 'vin', label: t('veh.vin'), maxLength: 17, dir: 'ltr' },
                { name: 'color', label: t('veh.color'), maxLength: 40 },
              ]}
            />
          </Card>
          <Card title={t('cust.edit')} id="edit-customer">
            <SimpleForm
              locale={locale}
              idPrefix="cedit"
              columns={3}
              hidden={{ version: String(d.version) }}
              action={updateCustomerAction.bind(null, locale, companyId, d.id)}
              submitLabel={t('cust.save')}
              fields={[
                { name: 'name', label: t('cust.name'), required: true, maxLength: 200, defaultValue: d.name },
                {
                  name: 'nameAr',
                  label: t('cust.nameAr'),
                  maxLength: 200,
                  dir: 'rtl',
                  defaultValue: d.nameAr ?? '',
                },
                {
                  name: 'phone',
                  label: t('cust.phone'),
                  required: true,
                  type: 'tel',
                  dir: 'ltr',
                  defaultValue: d.phone,
                },
                {
                  name: 'email',
                  label: t('cust.email'),
                  type: 'email',
                  dir: 'ltr',
                  defaultValue: d.email ?? '',
                },
                {
                  name: 'kind',
                  label: t('cust.kind'),
                  type: 'select',
                  required: true,
                  defaultValue: d.kind,
                  options: [
                    { value: 'individual', label: t('cust.kind.individual') },
                    { value: 'company', label: t('cust.kind.company') },
                  ],
                },
                { name: 'notes', label: t('cust.notes'), maxLength: 1000, defaultValue: d.notes ?? '' },
              ]}
            />
          </Card>
        </>
      ) : null}
    </>
  );
}
