import { unwrap } from '@erp/api-client';
import { createTranslator, isLocale, type MessageKey } from '@erp/localization';
import { PART_UNITS } from '@erp/validation';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProblemNotice } from '@/components/ProblemNotice';
import {
  buttonPrimary,
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
import { InlineForm } from '@/components/workshop/InlineForm';
import { attempt } from '@/lib/api';
import { loadCompany } from '@/lib/context';
import { createPartAction } from '../inventory-actions';

const field = 'flex flex-col gap-1 text-[13px] font-medium';

/** Parts catalogue with stock in the caller's branches (T-74). */
export default async function PartsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; companyId: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { locale, companyId } = await params;
  const q = ((await searchParams).q ?? '').slice(0, 80);
  if (!isLocale(locale)) notFound();
  const t = createTranslator(locale);
  const ctx = await loadCompany(companyId);
  if (!ctx.ok) return null;
  const res = await attempt(async () =>
    unwrap(
      await ctx.data.api.GET('/api/v1/companies/{companyId}/parts', {
        params: { path: { companyId }, query: q ? { q } : {} },
      }),
    ),
  );
  if (!res.ok) return <ProblemNotice result={res} locale={locale} />;
  const base = `/${locale}/c/${companyId}`;
  return (
    <>
      <PageHeader title={t('inv.parts')}>{t('inv.partsHelp')}</PageHeader>
      <Card className="mb-6">
        <form method="get" className="flex flex-wrap items-end gap-3" aria-label={t('inv.search')}>
          <label className={field}>
            {t('inv.search')}
            <input name="q" defaultValue={q} className={`${inputClass} w-64`} />
          </label>
          <button type="submit" className={buttonPrimary}>
            {t('ledger.apply')}
          </button>
        </form>
      </Card>
      {res.data.parts.length === 0 ? (
        <EmptyState>{t('inv.noParts')}</EmptyState>
      ) : (
        <Card title={t('inv.parts')} flush>
          <Table caption={t('inv.parts')}>
            <thead>
              <tr>
                <th scope="col" className={th}>
                  {t('inv.sku')}
                </th>
                <th scope="col" className={th}>
                  {t('bay.name')}
                </th>
                <th scope="col" className={th}>
                  {t('inv.unit')}
                </th>
                <th scope="col" className={thNum}>
                  {t('inv.onHand')}
                </th>
                <th scope="col" className={thNum}>
                  {t('inv.avgCost')}
                </th>
                <th scope="col" className={thNum}>
                  {t('inv.value')}
                </th>
              </tr>
            </thead>
            <tbody>
              {res.data.parts.map((p) => (
                <tr key={p.id} data-part={p.sku}>
                  <td className={td}>
                    <Link
                      href={`${base}/parts/${p.id}`}
                      className="font-medium text-[var(--color-primary)] hover:underline"
                    >
                      <Ltr>{p.sku}</Ltr>
                    </Link>
                  </td>
                  <td className={td}>
                    {locale === 'ar' && p.nameAr ? p.nameAr : p.name}
                    {p.brand ? <span className="text-[var(--color-text-muted)]"> · {p.brand}</span> : null}
                  </td>
                  <td className={td}>{t(`inv.unit.${p.unit}` as MessageKey)}</td>
                  <td className={tdNum}>
                    <Ltr>{p.onHand}</Ltr>
                  </td>
                  <td className={tdNum}>
                    <Ltr>{p.averageCost ?? '—'}</Ltr>
                  </td>
                  <td className={tdNum}>
                    <Ltr>{p.value}</Ltr>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
      {res.data.canCreate ? (
        <Card title={t('inv.addPart')} id="add-part">
          <InlineForm
            action={createPartAction.bind(null, locale, companyId)}
            locale={locale}
            submitLabel={t('inv.addPart')}
            ariaLabel={t('inv.addPart')}
          >
            <label className={field}>
              {t('inv.sku')}
              <input name="sku" maxLength={40} dir="ltr" className={`${inputClass} w-40`} />
            </label>
            <label className={field}>
              {t('bay.name')}
              <input name="name" maxLength={200} className={`${inputClass} w-56`} />
            </label>
            <label className={field}>
              {t('settings.nameAr')}
              <input name="nameAr" maxLength={200} dir="rtl" className={`${inputClass} w-48`} />
            </label>
            <label className={field}>
              {t('inv.brand')}
              <input name="brand" maxLength={80} className={`${inputClass} w-36`} />
            </label>
            <label className={field}>
              {t('inv.unit')}
              <select name="unit" defaultValue="each" className={`${inputClass} w-32`}>
                {PART_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {t(`inv.unit.${u}` as MessageKey)}
                  </option>
                ))}
              </select>
            </label>
          </InlineForm>
        </Card>
      ) : null}
    </>
  );
}
