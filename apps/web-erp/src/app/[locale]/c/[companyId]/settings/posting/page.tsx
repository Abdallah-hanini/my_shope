import { unwrap } from '@erp/api-client';
import { createTranslator, isLocale, type MessageKey } from '@erp/localization';
import { notFound } from 'next/navigation';
import { ProblemNotice } from '@/components/ProblemNotice';
import { Card, inputClass, PageHeader } from '@/components/ui';
import { InlineForm } from '@/components/workshop/InlineForm';
import { attempt } from '@/lib/api';
import { loadCompany } from '@/lib/context';
import { postingSettingsAction } from '../../billing-actions';

const FIELDS = [
  { key: 'labourRevenue', type: 'revenue' },
  { key: 'receivable', type: 'asset' },
  { key: 'cash', type: 'asset' },
  { key: 'card', type: 'asset' },
  { key: 'bank', type: 'asset' },
  { key: 'inventory', type: 'asset' },
  { key: 'goodsReceived', type: 'liability' },
  { key: 'stockAdjustment', type: 'expense' },
  { key: 'cogs', type: 'expense' },
  { key: 'partsRevenue', type: 'revenue' },
  { key: 'payables', type: 'liability' },
  { key: 'inputTax', type: 'asset' },
  { key: 'priceVariance', type: 'expense' },
  { key: 'transit', type: 'asset' },
] as const;

/** The accountant's posting accounts for invoices and payments (T-72). */
export default async function PostingPage({
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
  const path = { params: { path: { companyId } } };
  const [res, accounts] = await Promise.all([
    attempt(async () => unwrap(await api.GET('/api/v1/companies/{companyId}/posting-settings', path))),
    can('accounting.account.read')
      ? attempt(async () => unwrap(await api.GET('/api/v1/companies/{companyId}/accounts', path)))
      : Promise.resolve(null),
  ]);
  if (!res.ok) return <ProblemNotice result={res} locale={locale} />;
  const x = res.data;
  const list = accounts?.ok ? accounts.data.filter((a) => a.isPosting && a.status === 'active') : [];
  return (
    <>
      <PageHeader title={t('posting.title')}>{t('posting.help')}</PageHeader>
      <Card title={t('posting.title')} id="posting">
        <InlineForm
          action={postingSettingsAction.bind(null, locale, companyId)}
          locale={locale}
          submitLabel={t('cust.save')}
          submitClassName={x.canManage ? undefined : 'hidden'}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          ariaLabel={t('posting.title')}
        >
          <input type="hidden" name="version" value={x.version} />
          {FIELDS.map((f) => {
            const current = x[`${f.key}Account` as 'cashAccount'];
            return (
              <label key={f.key} className="flex flex-col gap-1 text-[13px] font-medium">
                {t(`posting.${f.key}` as MessageKey)}
                <select
                  name={`${f.key}AccountId`}
                  defaultValue={current?.id ?? ''}
                  disabled={!x.canManage}
                  className={inputClass}
                >
                  <option value="">{t('settings.noAccount')}</option>
                  {list
                    .filter((a) => a.type === f.type)
                    .map((a) => (
                      <option key={a.id} value={a.id}>{`${a.code} — ${a.name}`}</option>
                    ))}
                  {current && !list.some((a) => a.id === current.id) ? (
                    <option value={current.id}>{`${current.code} — ${current.name}`}</option>
                  ) : null}
                </select>
              </label>
            );
          })}
        </InlineForm>
      </Card>
    </>
  );
}
