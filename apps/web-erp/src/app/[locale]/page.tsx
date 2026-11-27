import { createApiClient, type HealthReport } from '@erp/api-client';
import { createTranslator, formatDateTime, isLocale, type MessageKey } from '@erp/localization';
import { StatusBadge } from '@erp/web-ui';
import { Building2 } from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { ProblemNotice } from '@/components/ProblemNotice';
import { buttonPrimary, buttonSecondary, Card, EmptyState, Notice } from '@/components/ui';
import { signInConfig, webConfig } from '@/lib/config';
import { companyName, loadUser } from '@/lib/context';
import { readSession } from '@/lib/session';

// Health and sign-in state are live: never prerender or cache this page.
export const dynamic = 'force-dynamic';

const dependencyLabel: Record<HealthReport['checks'][number]['name'], MessageKey> = {
  database: 'health.database',
  cache: 'health.cache',
  queue: 'health.queue',
};

const signInMessages: Record<string, MessageKey> = {
  failed: 'auth.failed',
  expired: 'auth.expired',
  denied: 'auth.denied',
};

async function loadHealth(): Promise<{ report?: HealthReport; failed: boolean }> {
  try {
    const client = createApiClient({
      baseUrl: webConfig().API_INTERNAL_URL,
      fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
    });
    return { report: await client.ready(), failed: false };
  } catch (err) {
    console.error('API readiness check failed:', err instanceof Error ? err.message : err);
    return { failed: true };
  }
}

export default async function HomePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ signin?: string }>;
}) {
  const { locale } = await params;
  const { signin } = await searchParams;
  if (!isLocale(locale)) notFound();
  const t = createTranslator(locale);

  const configured = signInConfig() !== null;
  const session = configured ? await readSession() : null;
  if (session && session.accessTokenExpiresAt - 30 <= Math.floor(Date.now() / 1000)) {
    redirect(`/session/refresh?returnTo=${encodeURIComponent(`/${locale}`)}`);
  }
  const [user, health] = await Promise.all([session ? loadUser() : null, loadHealth()]);
  const signinError = signin ? signInMessages[signin] : undefined;

  return (
    <AppShell
      locale={locale}
      title={t('app.brand')}
      titleHref={`/${locale}`}
      user={user?.ok ? { name: user.data.me.user.displayName, email: user.data.me.user.email } : undefined}
      companies={
        user?.ok
          ? user.data.me.companies.map((c) => ({
              id: c.companyId,
              name: companyName(c, locale),
              code: c.code,
            }))
          : []
      }
      canCreateCompany={user?.ok ? user.data.me.user.isPlatformAdmin : false}
    >
      <div className="flex flex-col gap-6">
        {signinError ? <Notice tone="danger">{t(signinError)}</Notice> : null}

        {!configured ? (
          <Notice>{t('auth.notConfigured')}</Notice>
        ) : !session ? (
          <Card title={t('auth.signIn')} id="signin">
            <p className="mb-4">{t('auth.prompt')}</p>
            <a href={`/session/login?returnTo=${encodeURIComponent(`/${locale}`)}`} className={buttonPrimary}>
              {t('auth.signIn')}
            </a>
          </Card>
        ) : !user?.ok ? (
          user && user.status === 403 ? (
            <Notice tone="danger">{t('auth.notProvisioned')}</Notice>
          ) : (
            <ProblemNotice result={user ?? { status: 0 }} locale={locale} />
          )
        ) : (
          <Card title={t('home.chooseCompany')} id="companies">
            {user.data.me.companies.length === 0 ? (
              <EmptyState icon={<Building2 aria-hidden size={18} />}>{t('home.noCompanies')}</EmptyState>
            ) : (
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {user.data.me.companies.map((c) => (
                  <li key={c.companyId}>
                    <Link
                      href={`/${locale}/c/${c.companyId}`}
                      className="flex min-h-16 flex-col justify-center rounded-[var(--radius-card)] border border-[var(--color-border)] px-4 py-2"
                    >
                      <span className="font-semibold">{companyName(c, locale)}</span>
                      <span dir="ltr" className="text-sm text-[var(--color-text-muted)]">
                        {c.code}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {user.data.me.user.isPlatformAdmin ? (
              <div className="mt-4">
                <Link href={`/${locale}/companies/new`} className={buttonSecondary}>
                  {t('company.new')}
                </Link>
              </div>
            ) : null}
          </Card>
        )}

        <section
          aria-labelledby="health-title"
          className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]"
        >
          <h2
            id="health-title"
            className="border-b border-[var(--color-border)] px-4 py-3 text-lg font-semibold"
          >
            {t('health.title')}
          </h2>
          {health.failed || !health.report ? (
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
                {health.report.checks.map((c) => (
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
              {health.report.events?.deadLettered ? (
                <p
                  role="alert"
                  className="border-b border-[var(--color-border)] bg-[var(--color-warning-bg)] px-4 py-3 text-sm text-[var(--color-warning)]"
                >
                  {t('health.deadLetters').replace('{n}', String(health.report.events.deadLettered))}
                </p>
              ) : null}
              <p className="px-4 py-3 text-sm text-[var(--color-text-muted)]">
                {t('common.lastChecked')}:{' '}
                <time dateTime={health.report.checkedAt}>
                  {formatDateTime(locale, health.report.checkedAt)}
                </time>
              </p>
            </>
          )}
        </section>
      </div>
    </AppShell>
  );
}
