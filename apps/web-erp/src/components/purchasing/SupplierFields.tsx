import type { createTranslator } from '@erp/localization';
import { inputClass } from '@/components/ui';

const field = 'flex flex-col gap-1 text-[13px] font-medium';

/** Supplier profile fields shared by the add and edit forms (T-76). */
export function SupplierFields({
  t,
  s,
}: {
  t: ReturnType<typeof createTranslator>;
  s?: {
    name: string;
    nameAr?: string | null;
    phone?: string | null;
    email?: string | null;
    taxNumber?: string | null;
    paymentTermsDays: number;
  };
}) {
  return (
    <>
      <label className={field}>
        {t('bay.name')}
        <input name="name" defaultValue={s?.name} maxLength={200} className={`${inputClass} w-56`} />
      </label>
      <label className={field}>
        {t('settings.nameAr')}
        <input
          name="nameAr"
          defaultValue={s?.nameAr ?? ''}
          maxLength={200}
          dir="rtl"
          className={`${inputClass} w-48`}
        />
      </label>
      <label className={field}>
        {t('pur.phone')}
        <input
          name="phone"
          defaultValue={s?.phone ?? ''}
          maxLength={40}
          dir="ltr"
          className={`${inputClass} w-40`}
        />
      </label>
      <label className={field}>
        {t('pur.email')}
        <input
          name="email"
          type="email"
          defaultValue={s?.email ?? ''}
          maxLength={200}
          dir="ltr"
          className={`${inputClass} w-52`}
        />
      </label>
      <label className={field}>
        {t('pur.taxNumber')}
        <input
          name="taxNumber"
          defaultValue={s?.taxNumber ?? ''}
          maxLength={40}
          dir="ltr"
          className={`${inputClass} w-40`}
        />
      </label>
      <label className={field}>
        {t('pur.termsField')}
        <input
          name="paymentTermsDays"
          type="number"
          min={0}
          max={365}
          defaultValue={s?.paymentTermsDays ?? 0}
          dir="ltr"
          className={`${inputClass} w-24`}
        />
      </label>
    </>
  );
}
