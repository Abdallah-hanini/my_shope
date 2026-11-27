import { unwrap } from '@erp/api-client';
import { createTranslator, formatDateTime, isLocale } from '@erp/localization';
import { History } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProblemNotice } from '@/components/ProblemNotice';
import { SimpleForm } from '@/components/SimpleForm';
import {
  buttonPrimary,
  Card,
  EmptyState,
  Ltr,
  PageHeader,
  Table,
  td,
  th,
  SplitLayout,
  DescriptionList,
} from '@/components/ui';
import { JobStatus } from '@/components/workshop/JobStatus';
import { attempt } from '@/lib/api';
import { loadCompany } from '@/lib/context';
import { updateVehicleAction } from '../../workshop-actions';

const UUID = /^[0-9a-f-]{36}$/i;

/** WEB-013 Vehicle profile and service history. */
export default async function VehiclePage({
  params,
}: {
  params: Promise<{ locale: string; companyId: string; vehicleId: string }>;
}) {
  const { locale, companyId, vehicleId } = await params;
  if (!isLocale(locale) || !UUID.test(vehicleId)) notFound();
  const t = createTranslator(locale);
  const ctx = await loadCompany(companyId);
  if (!ctx.ok) return null;
  const { api, can, company } = ctx.data;
  const path = { params: { path: { companyId, vehicleId } } };
  const [v, history, customers] = await Promise.all([
    attempt(async () => unwrap(await api.GET('/api/v1/companies/{companyId}/vehicles/{vehicleId}', path))),
    can('workshop.job.read')
      ? attempt(async () =>
          unwrap(await api.GET('/api/v1/companies/{companyId}/vehicles/{vehicleId}/jobs', path)),
        )
      : Promise.resolve(null),
    can('crm.customer.manage')
      ? attempt(async () =>
          unwrap(
            await api.GET('/api/v1/companies/{companyId}/customers', { params: { path: { companyId } } }),
          ),
        )
      : Promise.resolve(null),
  ]);
  if (!v.ok) {
    if (v.status === 404) notFound();
    return <ProblemNotice result={v} locale={locale} />;
  }
  const d = v.data;
  const base = `/${locale}/c/${companyId}`;
  return (
    <>
      <PageHeader
        title={d.plate}
        actions={
          can('workshop.job.manage') ? (
            <Link className={buttonPrimary} href={`${base}/jobs/new?vehicle=${d.id}`}>
              {t('veh.checkIn')}
            </Link>
          ) : null
        }
      >
        {`${d.make} ${d.model}${d.year ? ` (${d.year})` : ''}`} ·{' '}
        <Link href={`${base}/customers/${d.customerId}`} className="hover:underline">
          {d.customerName}
        </Link>
        {d.vin ? (
          <>
            {' · '}
            <Ltr>{d.vin}</Ltr>
          </>
        ) : null}
      </PageHeader>
      <SplitLayout
        main={
          <>
            {history ? (
              <Card title={t('veh.history')} id="history" flush>
                {!history.ok ? (
                  <div className="p-5">
                    <ProblemNotice result={history} locale={locale} />
                  </div>
                ) : history.data.length === 0 ? (
                  <EmptyState icon={<History aria-hidden size={18} />}>{t('veh.noHistory')}</EmptyState>
                ) : (
                  <Table caption={t('veh.history')}>
                    <thead>
                      <tr>
                        <th scope="col" className={th}>
                          {t('job.number')}
                        </th>
                        <th scope="col" className={th}>
                          {t('common.status')}
                        </th>
                        <th scope="col" className={th}>
                          {t('ledger.date')}
                        </th>
                        <th scope="col" className={th}>
                          {t('job.technician')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.data.map((j) => (
                        <tr key={j.id}>
                          <th scope="row" className={`${td} text-start font-medium`}>
                            <Link
                              href={`${base}/jobs/${j.id}`}
                              className="text-[var(--color-primary)] hover:underline"
                            >
                              <Ltr>{j.number}</Ltr>
                            </Link>
                          </th>
                          <td className={td}>
                            <JobStatus status={j.status} locale={locale} />
                          </td>
                          <td className={td}>{formatDateTime(locale, j.createdAt, company.timezone)}</td>
                          <td className={td}>{j.technicianNames.join(', ') || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                )}
              </Card>
            ) : null}
          </>
        }
        side={
          <>
            <Card title={t('common.details')} id="vehicle-details">
              <DescriptionList
                columns={1}
                items={[
                  {
                    label: t('veh.owner'),
                    value: (
                      <Link
                        href={`${base}/customers/${d.customerId}`}
                        className="text-[var(--color-primary)] hover:underline"
                      >
                        {d.customerName}
                      </Link>
                    ),
                  },
                  { label: t('veh.make'), value: `${d.make} ${d.model}${d.year ? ` (${d.year})` : ''}` },
                  { label: t('veh.vin'), value: d.vin ? <Ltr>{d.vin}</Ltr> : '—' },
                  { label: t('veh.color'), value: d.color || '—' },
                ]}
              />
            </Card>
            {customers?.ok ? (
              <Card title={t('veh.edit')} id="edit-vehicle">
                <p className="mb-3 text-sm text-[var(--color-text-muted)]">{t('veh.transferNote')}</p>
                <SimpleForm
                  locale={locale}
                  idPrefix="vedit"
                  columns={1}
                  hidden={{ version: String(d.version) }}
                  action={updateVehicleAction.bind(null, locale, companyId, d.id)}
                  submitLabel={t('cust.save')}
                  fields={[
                    {
                      name: 'customerId',
                      label: t('veh.owner'),
                      type: 'select',
                      required: true,
                      defaultValue: d.customerId,
                      options: customers.data.map((c) => ({ value: c.id, label: `${c.name} (${c.phone})` })),
                    },
                    {
                      name: 'plate',
                      label: t('veh.plate'),
                      required: true,
                      dir: 'ltr',
                      defaultValue: d.plate,
                    },
                    { name: 'make', label: t('veh.make'), required: true, defaultValue: d.make },
                    { name: 'model', label: t('veh.model'), required: true, defaultValue: d.model },
                    {
                      name: 'year',
                      label: t('veh.year'),
                      type: 'number',
                      dir: 'ltr',
                      defaultValue: d.year ? String(d.year) : '',
                    },
                    { name: 'vin', label: t('veh.vin'), dir: 'ltr', defaultValue: d.vin ?? '' },
                    { name: 'color', label: t('veh.color'), defaultValue: d.color ?? '' },
                  ]}
                />
              </Card>
            ) : null}
          </>
        }
      />
    </>
  );
}
