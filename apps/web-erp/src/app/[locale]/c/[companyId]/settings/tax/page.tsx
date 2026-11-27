import { unwrap } from '@erp/api-client';
import { createTranslator, isLocale } from '@erp/localization';
import { notFound } from 'next/navigation';
import { ProblemNotice } from '@/components/ProblemNotice';
import {
  Badge,
  buttonSecondary,
  Card,
  EmptyState,
  inputClass,
  Ltr,
  PageHeader,
  fieldLabel,
} from '@/components/ui';
import { InlineForm } from '@/components/workshop/InlineForm';
import { attempt } from '@/lib/api';
import { loadCompany } from '@/lib/context';
import { taxStepAction } from '../../settings-actions';

/** D-05 tax set-up by the accountant: codes, dated rates, the default and price basis. */
export default async function TaxPage({
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
    attempt(async () => unwrap(await api.GET('/api/v1/companies/{companyId}/tax', path))),
    can('accounting.account.read')
      ? attempt(async () => unwrap(await api.GET('/api/v1/companies/{companyId}/accounts', path)))
      : Promise.resolve(null),
  ]);
  if (!res.ok) return <ProblemNotice result={res} locale={locale} />;
  const x = res.data;
  const liability = accounts?.ok
    ? accounts.data.filter((a) => a.type === 'liability' && a.isPosting && a.status === 'active')
    : [];
  const step = (op: Parameters<typeof taxStepAction>[2]) => taxStepAction.bind(null, locale, companyId, op);
  const accountSelect = (current: string | null | undefined) => (
    <label className={fieldLabel}>
      {t('settings.taxAccount')}
      <select name="outputAccountId" defaultValue={current ?? ''} className={`${inputClass} w-56`}>
        <option value="">{t('settings.noAccount')}</option>
        {liability.map((a) => (
          <option key={a.id} value={a.id}>{`${a.code} — ${a.name}`}</option>
        ))}
      </select>
    </label>
  );
  return (
    <>
      <PageHeader title={t('settings.tax')}>{t('settings.taxHelp')}</PageHeader>
      <Card title={t('settings.taxSettings')} id="tax-settings">
        <p className="mb-3 text-sm" data-tax-default>
          {x.defaultTaxCodeId
            ? `${t('settings.defaultTax')}: ${x.codes.find((c) => c.id === x.defaultTaxCodeId)?.code ?? '—'}`
            : t('settings.noTax')}
        </p>
        {x.canManage ? (
          <InlineForm
            action={step({ kind: 'settings' })}
            locale={locale}
            submitLabel={t('cust.save')}
            ariaLabel={t('settings.taxSettings')}
          >
            <input type="hidden" name="version" value={x.version} />
            <label className={fieldLabel}>
              {t('settings.defaultTax')}
              <select
                name="defaultTaxCodeId"
                defaultValue={x.defaultTaxCodeId ?? ''}
                className={`${inputClass} w-48`}
              >
                <option value="">{t('settings.noTaxOption')}</option>
                {x.codes
                  .filter((c) => c.active)
                  .map((c) => (
                    <option key={c.id} value={c.id}>{`${c.code} — ${c.name}`}</option>
                  ))}
              </select>
            </label>
            <label className={fieldLabel}>
              {t('settings.priceBasis')}
              <select
                name="pricesIncludeTax"
                defaultValue={String(x.pricesIncludeTax)}
                className={`${inputClass} w-52`}
              >
                <option value="false">{t('settings.pricesExclude')}</option>
                <option value="true">{t('settings.pricesInclude')}</option>
              </select>
            </label>
            <label className={fieldLabel}>
              {t('settings.taxNo')}
              <input
                name="taxRegistrationNo"
                defaultValue={x.taxRegistrationNo ?? ''}
                maxLength={40}
                dir="ltr"
                className={`${inputClass} w-44`}
              />
            </label>
          </InlineForm>
        ) : null}
      </Card>

      {x.codes.length === 0 ? <EmptyState>{t('settings.noTaxCodes')}</EmptyState> : null}
      {x.codes.map((c) => (
        <Card key={c.id} title={`${c.code} — ${c.name}`} id={`tax-${c.code}`}>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm" data-tax-code={c.code}>
            {c.active ? <Badge tone="success">{t('bay.active')}</Badge> : <Badge>{t('bay.inactive')}</Badge>}
            <span>
              {t('settings.rateToday')}:{' '}
              {c.currentRatePct === null ? (
                t('settings.noRateYet')
              ) : (
                <Ltr>{`${Number(c.currentRatePct)} %`}</Ltr>
              )}
            </span>
            {c.outputAccount ? (
              <span className="text-[var(--color-text-muted)]">
                · {t('settings.taxAccount')}: {c.outputAccount.code} — {c.outputAccount.name}
              </span>
            ) : null}
          </div>
          <ul className="mb-3 flex flex-col gap-1 text-sm">
            {c.rates.map((r) => (
              <li key={r.id} data-rate={r.effectiveFrom} className="flex flex-wrap items-center gap-2">
                <Ltr>{`${Number(r.value)} %`}</Ltr> · {t('settings.from')} <Ltr>{r.effectiveFrom}</Ltr>
                {r.canRemove && x.canManage ? (
                  <InlineForm
                    action={step({ kind: 'removeRate', id: c.id, rateId: r.id })}
                    locale={locale}
                    submitLabel={t('settings.remove')}
                    submitClassName={buttonSecondary}
                    ariaLabel={`${t('settings.remove')} ${c.code} ${r.effectiveFrom}`}
                  />
                ) : null}
              </li>
            ))}
          </ul>
          {x.canManage ? (
            <div className="flex flex-col gap-4">
              <InlineForm
                action={step({ kind: 'addRate', id: c.id })}
                locale={locale}
                submitLabel={t('settings.addRate')}
                submitClassName={buttonSecondary}
                ariaLabel={`${t('settings.addRate')} ${c.code}`}
              >
                <label className={fieldLabel}>
                  {t('settings.ratePct')}
                  <input name="rate" inputMode="decimal" dir="ltr" className={`${inputClass} w-28`} />
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
              <details>
                <summary className="cursor-pointer text-sm font-medium">{t('settings.editCode')}</summary>
                <InlineForm
                  action={step({ kind: 'updateCode', id: c.id })}
                  locale={locale}
                  submitLabel={t('cust.save')}
                  submitClassName={buttonSecondary}
                  ariaLabel={`${t('settings.editCode')} ${c.code}`}
                >
                  <input type="hidden" name="version" value={c.version} />
                  <label className={fieldLabel}>
                    {t('bay.name')}
                    <input
                      name="name"
                      defaultValue={c.name}
                      maxLength={100}
                      className={`${inputClass} w-48`}
                    />
                  </label>
                  <label className={fieldLabel}>
                    {t('settings.nameAr')}
                    <input
                      name="nameAr"
                      defaultValue={c.nameAr ?? ''}
                      dir="rtl"
                      maxLength={100}
                      className={`${inputClass} w-48`}
                    />
                  </label>
                  {accountSelect(c.outputAccount?.id)}
                  <label className={fieldLabel}>
                    {t('common.status')}
                    <select name="active" defaultValue={String(c.active)} className={`${inputClass} w-36`}>
                      <option value="true">{t('bay.active')}</option>
                      <option value="false">{t('bay.inactive')}</option>
                    </select>
                  </label>
                </InlineForm>
              </details>
            </div>
          ) : null}
        </Card>
      ))}

      {x.canManage ? (
        <Card title={t('settings.addCode')} id="add-tax">
          <InlineForm
            action={step({ kind: 'createCode' })}
            locale={locale}
            submitLabel={t('settings.addCode')}
            ariaLabel={t('settings.addCode')}
          >
            <label className={fieldLabel}>
              {t('bay.code')}
              <input name="code" maxLength={15} dir="ltr" className={`${inputClass} w-32`} />
            </label>
            <label className={fieldLabel}>
              {t('bay.name')}
              <input name="name" maxLength={100} className={`${inputClass} w-48`} />
            </label>
            <label className={fieldLabel}>
              {t('settings.nameAr')}
              <input name="nameAr" dir="rtl" maxLength={100} className={`${inputClass} w-48`} />
            </label>
            {accountSelect(null)}
          </InlineForm>
        </Card>
      ) : null}
    </>
  );
}
