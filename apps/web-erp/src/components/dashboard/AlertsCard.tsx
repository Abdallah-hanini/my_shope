import { unwrap } from '@erp/api-client';
import { createTranslator, groupDigits, type Locale, type MessageKey } from '@erp/localization';
import { BellRing, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { attempt, type Api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { Card } from '../ui';

/**
 * Business alerts (R3a), computed live by the API from the reports that explain them; each person
 * sees only what their permissions cover. Hidden when the request fails (the reports still work).
 */
export async function AlertsCard({
  api,
  companyId,
  locale,
  base,
}: {
  api: Api;
  companyId: string;
  locale: Locale;
  base: string;
}) {
  const t = createTranslator(locale);
  const res = await attempt(async () =>
    unwrap(await api.GET('/api/v1/companies/{companyId}/alerts', { params: { path: { companyId } } })),
  );
  if (!res.ok) return null;
  const { alerts, currency, overdueDays } = res.data;
  const text = (a: (typeof alerts)[number]) =>
    t(`plan.alert.${a.key}` as MessageKey)
      .replace('{n}', String(a.count ?? 0))
      .replace('{days}', String(overdueDays))
      .replace('{amount}', a.amount ? `${groupDigits(a.amount)} ${currency}` : '')
      .replace('{expected}', a.expected ? `${groupDigits(a.expected)} ${currency}` : '');
  return (
    <Card title={t('plan.alerts')} id="alerts" className="mb-6">
      {alerts.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]" data-alerts="none">
          {t('plan.noAlerts')}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {alerts.map((a) => (
            <li key={a.key + a.href}>
              <Link
                href={`${base}/${a.href}`}
                data-alert={a.key}
                className={cn(
                  'flex items-center gap-3 rounded-[var(--radius-control)] border px-3 py-2.5 text-sm transition-colors hover:bg-[var(--color-surface-muted)]',
                  a.severity === 'danger'
                    ? 'border-[var(--color-danger-brand)]/40'
                    : 'border-[var(--color-border)]',
                )}
              >
                <BellRing
                  aria-hidden
                  size={16}
                  className={
                    a.severity === 'danger' ? 'text-[var(--color-danger)]' : 'text-[var(--color-warning)]'
                  }
                />
                <span className="sr-only">
                  {t(a.severity === 'danger' ? 'plan.severity.danger' : 'plan.severity.warning')}
                </span>
                <span className="min-w-0 flex-1">{text(a)}</span>
                <ChevronRight
                  aria-hidden
                  size={16}
                  className="shrink-0 text-[var(--color-text-muted)] rtl:-scale-x-100"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
