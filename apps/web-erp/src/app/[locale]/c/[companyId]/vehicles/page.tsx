import { unwrap } from '@erp/api-client';
import { createTranslator, isLocale } from '@erp/localization';
import { Car } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProblemNotice } from '@/components/ProblemNotice';
import {
  buttonSecondary,
  Card,
  EmptyState,
  inputClass,
  Ltr,
  PageHeader,
  Table,
  td,
  th,
} from '@/components/ui';
import { attempt } from '@/lib/api';
import { loadCompany } from '@/lib/context';

/** WEB-012 Vehicle registry. */
export default async function VehiclesPage({
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
  const list = await attempt(async () =>
    unwrap(
      await ctx.data.api.GET('/api/v1/companies/{companyId}/vehicles', {
        params: { path: { companyId }, query: q ? { q } : {} },
      }),
    ),
  );
  const base = `/${locale}/c/${companyId}`;
  return (
    <>
      <PageHeader
        title={t('veh.title')}
        actions={
          ctx.data.can('crm.customer.manage') ? (
            <Link className={buttonSecondary} href={`${base}/customers#new-customer`}>
              {t('cust.new')}
            </Link>
          ) : null
        }
      />
      <form role="search" method="get" className="mb-4 flex gap-2">
        <label htmlFor="veh-q" className="sr-only">
          {t('veh.search')}
        </label>
        <input
          id="veh-q"
          name="q"
          type="search"
          defaultValue={q}
          placeholder={t('veh.search')}
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
          <EmptyState icon={<Car aria-hidden size={18} />}>{t('veh.empty')}</EmptyState>
        ) : (
          <Table caption={t('veh.title')}>
            <thead>
              <tr>
                <th scope="col" className={th}>
                  {t('veh.plate')}
                </th>
                <th scope="col" className={th}>
                  {t('veh.make')}
                </th>
                <th scope="col" className={th}>
                  {t('veh.owner')}
                </th>
                <th scope="col" className={th}>
                  {t('veh.vin')}
                </th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((v) => (
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
                    <Link href={`${base}/customers/${v.customerId}`} className="hover:underline">
                      {v.customerName}
                    </Link>
                  </td>
                  <td className={td}>
                    <Ltr>{v.vin ?? '—'}</Ltr>
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
