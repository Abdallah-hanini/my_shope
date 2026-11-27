import { unwrap } from '@erp/api-client';
import { createTranslator, isLocale } from '@erp/localization';
import { notFound } from 'next/navigation';
import { ProblemNotice } from '@/components/ProblemNotice';
import { buttonSecondary, Card, inputClass, Ltr, PageHeader, fieldLabel } from '@/components/ui';
import { InlineForm } from '@/components/workshop/InlineForm';
import { attempt } from '@/lib/api';
import { loadCompany } from '@/lib/context';
import { pricingStepAction } from '../../settings-actions';

/** Labour rates per branch and the managers' discount limit (owner). */
export default async function PricingPage({
  params,
}: {
  params: Promise<{ locale: string; companyId: string }>;
}) {
  const { locale, companyId } = await params;
  if (!isLocale(locale)) notFound();
  const t = createTranslator(locale);
  const ctx = await loadCompany(companyId);
  if (!ctx.ok) return null;
  const res = await attempt(async () =>
    unwrap(
      await ctx.data.api.GET('/api/v1/companies/{companyId}/pricing', { params: { path: { companyId } } }),
    ),
  );
  if (!res.ok) return <ProblemNotice result={res} locale={locale} />;
  const x = res.data;
  const step = (op: Parameters<typeof pricingStepAction>[2]) =>
    pricingStepAction.bind(null, locale, companyId, op);
  return (
    <>
      <PageHeader title={t('settings.pricing')}>{t('settings.pricingHelp')}</PageHeader>
      <Card title={t('settings.discountLimit')} id="discount">
        <p className="mb-3 text-sm" data-discount-limit>
          {t('settings.discountLimitHelp')}{' '}
          <strong>
            <Ltr>{`${Number(x.managerDiscountLimitPct)} %`}</Ltr>
          </strong>
        </p>
        {x.canManageSettings ? (
          <InlineForm
            action={step({ kind: 'settings' })}
            locale={locale}
            submitLabel={t('cust.save')}
            ariaLabel={t('settings.discountLimit')}
          >
            <input type="hidden" name="version" value={x.version} />
            <label className={fieldLabel}>
              {t('settings.ratePct')}
              <input
                name="managerDiscountLimitPct"
                defaultValue={String(Number(x.managerDiscountLimitPct))}
                inputMode="decimal"
                dir="ltr"
                className={`${inputClass} w-28`}
              />
            </label>
          </InlineForm>
        ) : null}
      </Card>
      {x.branches.map((b) => (
        <Card
          key={b.branchId}
          title={`${t('settings.labourRate')} — ${b.branchCode} ${b.branchName}`}
          id={`rate-${b.branchCode}`}
        >
          <p className="mb-2 text-sm" data-branch-rate={b.branchCode}>
            {t('settings.rateToday')}:{' '}
            {b.currentRate ? <Ltr>{`${b.currentRate} ${x.currency} / h`}</Ltr> : t('settings.noRateYet')}
          </p>
          <ul className="mb-3 flex flex-col gap-1 text-sm">
            {b.rates.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2">
                <Ltr>{`${r.value} ${x.currency}`}</Ltr> · {t('settings.from')} <Ltr>{r.effectiveFrom}</Ltr>
                {r.canRemove && b.canManage ? (
                  <InlineForm
                    action={step({ kind: 'removeRate', rateId: r.id })}
                    locale={locale}
                    submitLabel={t('settings.remove')}
                    submitClassName={buttonSecondary}
                    ariaLabel={`${t('settings.remove')} ${b.branchCode} ${r.effectiveFrom}`}
                  />
                ) : null}
              </li>
            ))}
          </ul>
          {b.canManage ? (
            <InlineForm
              action={step({ kind: 'addRate', branchId: b.branchId })}
              locale={locale}
              submitLabel={t('settings.addRate')}
              submitClassName={buttonSecondary}
              ariaLabel={`${t('settings.addRate')} ${b.branchCode}`}
            >
              <label className={fieldLabel}>
                {`${t('settings.perHour')} (${x.currency})`}
                <input name="rate" inputMode="decimal" dir="ltr" className={`${inputClass} w-32`} />
              </label>
              <label className={fieldLabel}>
                {t('settings.from')}
                <input
                  name="effectiveFrom"
                  type="date"
                  min={x.today}
                  defaultValue={x.today}
                  dir="ltr"
                  className={`${inputClass} w-44`}
                />
              </label>
            </InlineForm>
          ) : null}
        </Card>
      ))}
    </>
  );
}
