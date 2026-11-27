import { unwrap, type Notification } from '@erp/api-client';
import { createTranslator, formatDateTime, isLocale } from '@erp/localization';
import { Bell, BookText, Download, KeyRound, Lock, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionButton } from '@/components/access/ActionButton';
import { ProblemNotice } from '@/components/ProblemNotice';
import { UnreadSync } from '@/components/shell/NotificationBell';
import { buttonSecondary, Card, EmptyState, PageHeader, Tabs } from '@/components/ui';
import { attempt } from '@/lib/api';
import { loadCompany } from '@/lib/context';
import { renderNotification } from '@/lib/notifications';
import { markAllNotificationsReadAction, openNotificationAction } from '../notification-actions';

const CURSOR = /^[A-Za-z0-9_-]{1,200}$/;
const ICON: Record<string, typeof Bell> = {
  journal_reversed: BookText,
  role_granted: KeyRound,
  role_revoked: KeyRound,
  role_changed: KeyRound,
  period_closed: Lock,
  export_ready: Download,
  export_failed: TriangleAlert,
};

/** Notification inbox (docs/SCREEN_CONTRACTS.md, "Notification inbox"). */
export default async function NotificationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; companyId: string }>;
  searchParams: Promise<{ filter?: string; cursor?: string }>;
}) {
  const { locale, companyId } = await params;
  const sp = await searchParams;
  if (!isLocale(locale)) notFound();
  const t = createTranslator(locale);
  const ctx = await loadCompany(companyId);
  if (!ctx.ok) return null;
  const { api, company } = ctx.data;
  const unreadOnly = sp.filter === 'unread';
  const cursor = sp.cursor && CURSOR.test(sp.cursor) ? sp.cursor : undefined;
  const page = await attempt(async () =>
    unwrap(
      await api.GET('/api/v1/companies/{companyId}/notifications', {
        params: {
          path: { companyId },
          query: { limit: 20, ...(unreadOnly ? { unreadOnly: 'true' } : {}), ...(cursor ? { cursor } : {}) },
        },
      }),
    ),
  );
  const base = `/${locale}/c/${companyId}/notifications`;
  return (
    <>
      <PageHeader
        title={t('notify.title')}
        actions={
          page.ok && page.data.unreadCount > 0 ? (
            <ActionButton
              locale={locale}
              label={t('notify.markAll')}
              className={buttonSecondary}
              action={markAllNotificationsReadAction.bind(null, locale, companyId)}
            />
          ) : null
        }
      >
        {t('notify.help')}
      </PageHeader>
      <Tabs
        label={t('notify.title')}
        items={[
          { href: base, label: t('notify.all'), current: !unreadOnly },
          {
            href: `${base}?filter=unread`,
            label: t('notify.unreadOnly'),
            current: unreadOnly,
            count: page.ok && page.data.unreadCount ? page.data.unreadCount : undefined,
          },
        ]}
      />
      {!page.ok ? (
        <ProblemNotice result={page} locale={locale} />
      ) : (
        <>
          <UnreadSync count={page.data.unreadCount} />
          <Card flush>
            {page.data.items.length === 0 ? (
              <EmptyState>{unreadOnly ? t('notify.emptyUnread') : t('notify.empty')}</EmptyState>
            ) : (
              <ul className="divide-y divide-[var(--color-border)]" aria-label={t('notify.title')}>
                {page.data.items.map((n: Notification) => {
                  const Icon = ICON[n.kind] ?? Bell;
                  const unread = !n.readAt;
                  return (
                    <li
                      key={n.id}
                      data-notification={n.kind}
                      className={`flex flex-wrap items-start gap-3 px-5 py-4 ${unread ? 'bg-[var(--color-surface-muted)]' : ''}`}
                    >
                      <Icon
                        aria-hidden
                        size={18}
                        className="mt-0.5 shrink-0 text-[var(--color-text-muted)]"
                      />
                      <div className="min-w-0 flex-1">
                        <p className={unread ? 'font-semibold' : ''}>
                          {unread ? <span className="sr-only">{t('notify.unread')}: </span> : null}
                          {renderNotification(n, locale)}
                        </p>
                        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                          <time dateTime={n.createdAt}>
                            {formatDateTime(locale, n.createdAt, company.timezone)}
                          </time>
                        </p>
                      </div>
                      {n.link || unread ? (
                        <ActionButton
                          locale={locale}
                          label={n.link ? t('notify.open') : t('notify.markRead')}
                          className={buttonSecondary}
                          action={openNotificationAction.bind(null, locale, companyId, n.id, n.link ?? null)}
                        />
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
          <nav className="mt-4 flex gap-2" aria-label={t('notify.older')}>
            {cursor ? (
              <Link className={buttonSecondary} href={unreadOnly ? `${base}?filter=unread` : base}>
                {t('notify.newest')}
              </Link>
            ) : null}
            {page.data.nextCursor ? (
              <Link
                className={buttonSecondary}
                href={`${base}?${new URLSearchParams({ ...(unreadOnly ? { filter: 'unread' } : {}), cursor: page.data.nextCursor })}`}
              >
                {t('notify.older')}
              </Link>
            ) : null}
          </nav>
        </>
      )}
    </>
  );
}
