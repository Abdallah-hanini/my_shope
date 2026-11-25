import { createApiClient, type HealthReport } from '@erp/api-client';
import { createTranslator, formatDateTime, isLocale, type Locale, type MessageKey } from '@erp/localization';
import { StatusBadge } from '@erp/web-ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';

// Health is live server state: never prerender or cache it.
export const dynamic = 'force-dynamic';

const dependencyLabel: Record<HealthReport['checks'][number]['name'], MessageKey> = {
  database: 'health.database',
  cache: 'health.cache',
  queue: 'health.queue',
};

async function loadHealth(): Promise<{ report?: HealthReport; failed: boolean }> {
  const baseUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';
  try {
    const client = createApiClient({ baseUrl, fetch: (req) => fetch(req, { cache: 'no-store' }) });
    return { report: await client.ready(), failed: false };
  } catch (err) {
    console.error('API readiness check failed:', err instanceof Error ? err.message : err);
    return { failed: true };
  }
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = createTranslator(locale);
  const other: Locale = locale === 'ar' ? 'en' : 'ar';
  const { report, failed } = await loadHealth();

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">{t('app.erp.name')}</h1>
          <p className="mt-1 text-[var(--color-text-muted)]">{t('erp.home.subtitle')}</p>
        </div>
        <Link
          href={`/${other}`}
          hrefLang={other}
          lang={other}
          className="inline-flex min-h-11 items-center rounded-lg border border-[var(--color-border)] px-4 font-semibold"
        >
          {t('common.switchLanguage')}
        </Link>
      </header>

      <p
        role="note"
        className="rounded-lg border border-[var(--color-border)] bg-[var(--color-warning-bg)] p-4 text-[var(--color-warning)]"
      >
        {t('foundation.notice')}
      </p>

      <section
        aria-labelledby="health-title"
        className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]"
      >
        <h2
          id="health-title"
          className="border-b border-[var(--color-border)] px-4 py-3 text-lg font-semibold"
        >
          {t('health.title')}
        </h2>
        {failed || !report ? (
          <div role="alert" className="flex items-center justify-between gap-4 px-4 py-3">
            <span>{t('health.api')}</span>
            <StatusBadge tone="down" label={t('health.unreachable')} />
          </div>
        ) : (
          <>
            <ul>
              <li className="flex min-h-11 items-center justify-between gap-4 border-b border-[var(--color-border)] px-4 py-2">
                <span>{t('health.api')}</span>
                <StatusBadge tone="up" label={t('health.status.up')} />
              </li>
              {report.checks.map((c) => (
                <li
                  key={c.name}
                  data-check={c.name}
                  className="flex min-h-11 items-center justify-between gap-4 border-b border-[var(--color-border)] px-4 py-2 last:border-b-0"
                >
                  <span>{t(dependencyLabel[c.name])}</span>
                  <StatusBadge
                    tone={c.status}
                    label={t(c.status === 'up' ? 'health.status.up' : 'health.status.down')}
                  />
                </li>
              ))}
            </ul>
            <p className="px-4 py-3 text-sm text-[var(--color-text-muted)]">
              {t('common.lastChecked')}:{' '}
              <time dateTime={report.checkedAt}>{formatDateTime(locale, report.checkedAt)}</time>
            </p>
          </>
        )}
      </section>
    </main>
  );
}
