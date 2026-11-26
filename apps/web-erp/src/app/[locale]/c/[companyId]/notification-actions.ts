'use server';

import { expectOk, unwrap } from '@erp/api-client';
import { resolveLocale } from '@erp/localization';
import { redirect } from 'next/navigation';
import { mutate } from '@/lib/actions';
import type { FormState } from '@/lib/form-state';

const INTERNAL = /^[a-z][a-z-]*(\/[0-9a-f-]{36})?$/;

/** Marks one notification read and opens its record (only paths inside this company). */
export async function openNotificationAction(
  localeRaw: string,
  companyId: string,
  notificationId: string,
  link: string | null,
): Promise<FormState> {
  const locale = resolveLocale(localeRaw);
  const failed = await mutate(locale, {}, async (api) => {
    unwrap(
      await api.POST('/api/v1/companies/{companyId}/notifications/{notificationId}/read', {
        params: { path: { companyId, notificationId } },
      }),
    );
  });
  if (failed) return failed;
  redirect(
    link && INTERNAL.test(link)
      ? `/${locale}/c/${companyId}/${link}`
      : `/${locale}/c/${companyId}/notifications`,
  );
}

export async function markAllNotificationsReadAction(
  localeRaw: string,
  companyId: string,
): Promise<FormState> {
  const locale = resolveLocale(localeRaw);
  const failed = await mutate(locale, {}, async (api) => {
    expectOk(
      await api.POST('/api/v1/companies/{companyId}/notifications/read-all', {
        params: { path: { companyId } },
      }),
    );
  });
  if (failed) return failed;
  redirect(`/${locale}/c/${companyId}/notifications`);
}
