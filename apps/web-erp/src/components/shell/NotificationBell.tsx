'use client';

import { createTranslator, type Locale } from '@erp/localization';
import { Bell } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

/** Window event the inbox page sends after changes, so the badge updates at once. */
export const UNREAD_EVENT = 'erp:unread-count';
const POLL_MS = 30_000;

/**
 * Header bell with the unread count, fetched in the browser (layouts are not re-rendered on
 * navigation, so a server-rendered count would go stale). Refreshes on navigation, every 30 s
 * while the tab is visible, and when the inbox reports a change. Failure shows no number rather
 * than a wrong one.
 */
export function NotificationBell({
  locale,
  inboxHref,
  countHref,
}: {
  locale: Locale;
  inboxHref: string;
  countHref: string;
}) {
  const t = createTranslator(locale);
  const path = usePathname();
  const [count, setCount] = useState<number | null>(null);
  const refresh = useCallback(async () => {
    try {
      const res = await fetch(countHref, { cache: 'no-store' });
      setCount(res.ok ? ((await res.json()) as { unreadCount: number }).unreadCount : null);
    } catch {
      setCount(null);
    }
  }, [countHref]);
  useEffect(() => {
    void refresh();
  }, [refresh, path]);
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, POLL_MS);
    const onEvent = (e: Event) => setCount((e as CustomEvent<number>).detail);
    window.addEventListener(UNREAD_EVENT, onEvent);
    return () => {
      clearInterval(id);
      window.removeEventListener(UNREAD_EVENT, onEvent);
    };
  }, [refresh]);
  const label = count
    ? `${t('notify.bell')}: ${t('notify.unreadCount').replace('{n}', String(count))}`
    : t('notify.bell');
  return (
    <Link
      href={inboxHref}
      aria-label={label}
      data-testid="notification-bell"
      className="relative inline-flex size-10 items-center justify-center rounded-[var(--radius-control)] border border-[var(--color-border)] hover:bg-[var(--color-surface-muted)] transition-colors"
    >
      <Bell aria-hidden size={18} />
      {count ? (
        <span
          aria-hidden
          className="absolute -end-1.5 -top-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--color-danger-brand)] px-1 text-[11px] leading-5 font-bold text-white ring-2 ring-[var(--color-surface)]"
        >
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </Link>
  );
}

/** Rendered by the inbox page: tells the bell the current count after server-side changes. */
export function UnreadSync({ count }: { count: number }) {
  useEffect(() => {
    window.dispatchEvent(new CustomEvent(UNREAD_EVENT, { detail: count }));
  }, [count]);
  return null;
}
