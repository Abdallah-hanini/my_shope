import { unwrap } from '@erp/api-client';
import { createTranslator, isLocale } from '@erp/localization';
import { notFound } from 'next/navigation';
import { ProblemNotice } from '@/components/ProblemNotice';
import { buttonSecondary, Card, inputClass, PageHeader } from '@/components/ui';
import { InlineForm } from '@/components/workshop/InlineForm';
import { attempt } from '@/lib/api';
import { loadCompany } from '@/lib/context';
import { logoAction, profileAction } from '../../settings-actions';

const field = 'flex flex-col gap-1.5 text-[13px] font-medium';

/** Company letterhead: CR number, address, phone and logo (printed on documents). */
export default async function CompanyProfilePage({
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
      await ctx.data.api.GET('/api/v1/companies/{companyId}/profile', { params: { path: { companyId } } }),
    ),
  );
  if (!res.ok) return <ProblemNotice result={res} locale={locale} />;
  const p = res.data;
  const ro = !p.canManage;
  return (
    <>
      <PageHeader title={t('settings.company')}>{t('settings.companyHelp')}</PageHeader>
      <Card title={locale === 'ar' && p.legalNameAr ? p.legalNameAr : p.legalName} id="letterhead">
        <InlineForm
          action={profileAction.bind(null, locale, companyId)}
          locale={locale}
          submitLabel={t('cust.save')}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          ariaLabel={t('settings.company')}
        >
          <input type="hidden" name="version" value={p.version} />
          <label className={field}>
            {t('settings.crNumber')}
            <input
              name="crNumber"
              defaultValue={p.crNumber ?? ''}
              maxLength={40}
              dir="ltr"
              disabled={ro}
              className={inputClass}
            />
          </label>
          <label className={field}>
            {t('cust.phone')}
            <input name="phone" defaultValue={p.phone ?? ''} dir="ltr" disabled={ro} className={inputClass} />
          </label>
          <label className={field}>
            {t('settings.address')}
            <textarea
              name="address"
              rows={2}
              defaultValue={p.address ?? ''}
              maxLength={300}
              disabled={ro}
              className={inputClass}
            />
          </label>
          <label className={field}>
            {t('settings.addressAr')}
            <textarea
              name="addressAr"
              rows={2}
              dir="rtl"
              defaultValue={p.addressAr ?? ''}
              maxLength={300}
              disabled={ro}
              className={inputClass}
            />
          </label>
        </InlineForm>
        <p className="mt-3 text-xs text-[var(--color-text-muted)]">
          {t('settings.taxNo')}: {p.taxRegistrationNo ?? '—'} · {t('settings.taxNoHelp')}
        </p>
      </Card>
      <Card title={t('settings.logo')} id="logo">
        {p.logoVersion ? (
          // eslint-disable-next-line @next/next/no-img-element -- served by our own route with the session
          <img
            src={`/${locale}/c/${companyId}/settings/logo?v=${p.logoVersion}`}
            alt={t('settings.logo')}
            className="mb-4 max-h-24 w-auto border border-[var(--color-border)] bg-white p-2"
          />
        ) : (
          <p className="mb-4 text-sm text-[var(--color-text-muted)]">{t('settings.noLogo')}</p>
        )}
        {p.canManage ? (
          <div className="flex flex-wrap items-end gap-4">
            <InlineForm
              action={logoAction.bind(null, locale, companyId, 'upload')}
              locale={locale}
              submitLabel={t('settings.uploadLogo')}
              submitClassName={buttonSecondary}
              ariaLabel={t('settings.uploadLogo')}
            >
              <label className={field}>
                {t('settings.logoHelp')}
                <input name="file" type="file" accept="image/jpeg,image/png,image/webp" className="text-sm" />
              </label>
            </InlineForm>
            {p.logoVersion ? (
              <InlineForm
                action={logoAction.bind(null, locale, companyId, 'remove')}
                locale={locale}
                submitLabel={t('settings.removeLogo')}
                submitClassName={buttonSecondary}
                ariaLabel={t('settings.removeLogo')}
              />
            ) : null}
          </div>
        ) : null}
      </Card>
    </>
  );
}
