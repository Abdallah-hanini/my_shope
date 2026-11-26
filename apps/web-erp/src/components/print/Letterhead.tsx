import type { Company, CompanyProfile } from '@erp/api-client';
import { createTranslator, type Locale } from '@erp/localization';
import { Ltr } from '../ui';

/** Company letterhead for printed documents (T-70): empty details are simply left off. */
export function Letterhead({
  company,
  profile,
  locale,
  companyId,
  branchCode,
}: {
  company: Company;
  profile: CompanyProfile | null;
  locale: Locale;
  companyId: string;
  branchCode: string;
}) {
  const t = createTranslator(locale);
  const name = locale === 'ar' && company.legalNameAr ? company.legalNameAr : company.legalName;
  const address = profile
    ? locale === 'ar' && profile.addressAr
      ? profile.addressAr
      : profile.address
    : null;
  return (
    <div className="flex items-start gap-3" data-letterhead>
      {profile?.logoVersion ? (
        // eslint-disable-next-line @next/next/no-img-element -- served by our own route with the session
        <img
          src={`/${locale}/c/${companyId}/settings/logo?v=${profile.logoVersion}`}
          alt=""
          className="max-h-16 w-auto"
        />
      ) : null}
      <div className="text-xs">
        <p className="text-base font-bold">{name}</p>
        {address ? <p className="whitespace-pre-line">{address}</p> : null}
        {profile?.phone ? (
          <p>
            {t('cust.phone')}: <Ltr>{profile.phone}</Ltr>
          </p>
        ) : null}
        {profile?.crNumber ? (
          <p>
            {t('settings.crNumber')}: <Ltr>{profile.crNumber}</Ltr>
          </p>
        ) : null}
        {profile?.taxRegistrationNo ? (
          <p>
            {t('settings.taxNo')}: <Ltr>{profile.taxRegistrationNo}</Ltr>
          </p>
        ) : null}
        <p>
          {t('job.branch')}: {branchCode}
        </p>
      </div>
    </div>
  );
}
