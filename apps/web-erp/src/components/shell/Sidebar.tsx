'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { createTranslator, type Locale } from '@erp/localization';
import {
  BookOpen,
  BookText,
  Building2,
  CalendarClock,
  Timer,
  LayoutGrid,
  CalendarRange,
  Car,
  CarFront,
  Contact,
  FileDown,
  Grid3x3,
  KeyRound,
  LayoutDashboard,
  ListTree,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Scale,
  ShieldCheck,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { cn } from '@/lib/cn';

export interface SidebarItem {
  href: string;
  label: string;
  icon: keyof typeof icons;
}
export interface SidebarGroup {
  label?: string;
  items: SidebarItem[];
}

const icons = {
  LayoutDashboard,
  BookText,
  BookOpen,
  Scale,
  FileDown,
  ListTree,
  CalendarRange,
  Building2,
  ShieldCheck,
  Users,
  KeyRound,
  Grid3x3,
  Wrench,
  Car,
  Contact,
  CalendarClock,
  Timer,
  LayoutGrid,
} as const;

function isActive(path: string, href: string, exact: boolean) {
  return exact ? path === href : path === href || path.startsWith(`${href}/`);
}

function NavList({
  groups,
  collapsed,
  label,
  onNavigate,
}: {
  groups: SidebarGroup[];
  collapsed: boolean;
  label: string;
  onNavigate?: () => void;
}) {
  const path = usePathname() ?? '';
  const first = groups[0]?.items[0]?.href;
  return (
    <nav aria-label={label} className="flex-1 overflow-y-auto px-3 py-4">
      {groups.map((g, gi) => (
        <div key={gi} className="mb-5">
          {g.label && !collapsed ? (
            <p className="mb-1.5 px-3 text-[11px] font-semibold tracking-wider text-[var(--color-sidebar-muted)] uppercase">
              {g.label}
            </p>
          ) : null}
          <ul className="flex flex-col gap-0.5">
            {g.items.map((i) => {
              const Icon = icons[i.icon];
              const active = isActive(path, i.href, i.href === first);
              return (
                <li key={i.href}>
                  <Link
                    href={i.href}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    aria-label={collapsed ? i.label : undefined}
                    title={collapsed ? i.label : undefined}
                    className={cn(
                      'flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm text-[var(--color-sidebar-text)] hover:bg-[var(--color-sidebar-active)]',
                      active &&
                        'bg-[var(--color-sidebar-active)] font-semibold shadow-[inset_3px_0_0_var(--color-primary)] rtl:shadow-[inset_-3px_0_0_var(--color-primary)]',
                      collapsed && 'justify-center px-0',
                    )}
                  >
                    <Icon aria-hidden size={18} className="shrink-0" />
                    {collapsed ? null : <span className="truncate">{i.label}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Brand({ collapsed, companyName }: { collapsed: boolean; companyName?: string }) {
  return (
    <div
      className={cn(
        'flex h-16 shrink-0 items-center gap-3 border-b border-white/10 px-5',
        collapsed && 'justify-center px-0',
      )}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary)] text-[var(--color-on-primary)]">
        <CarFront aria-hidden size={18} />
      </span>
      {collapsed ? null : (
        <span className="min-w-0">
          <span className="block text-sm font-bold tracking-wide text-white" dir="ltr">
            AUTO360
          </span>
          {companyName ? (
            <span className="block truncate text-xs text-[var(--color-sidebar-muted)]">{companyName}</span>
          ) : null}
        </span>
      )}
    </div>
  );
}

/** Desktop sidebar: 248 px expanded, 72 px collapsed (preference kept in a cookie). */
export function DesktopSidebar({
  locale,
  groups,
  initialCollapsed,
  companyName,
}: {
  locale: Locale;
  groups: SidebarGroup[];
  initialCollapsed: boolean;
  companyName?: string;
}) {
  const t = createTranslator(locale);
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `erp_sidebar=${next ? 'collapsed' : 'expanded'}; path=/; max-age=31536000; samesite=lax`;
  };
  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;
  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-dvh shrink-0 flex-col bg-[var(--color-sidebar)] text-[var(--color-sidebar-text)] lg:flex print:hidden',
        collapsed ? 'w-[72px]' : 'w-[248px]',
      )}
    >
      <Brand collapsed={collapsed} companyName={companyName} />
      <NavList groups={groups} collapsed={collapsed} label={t('nav.mainLabel')} />
      <button
        type="button"
        onClick={toggle}
        aria-label={collapsed ? t('nav.expand') : t('nav.collapse')}
        aria-expanded={!collapsed}
        className="m-3 flex min-h-10 items-center justify-center gap-2 rounded-lg text-sm text-[var(--color-sidebar-muted)] hover:bg-[var(--color-sidebar-active)]"
      >
        <ToggleIcon aria-hidden size={18} className="rtl:-scale-x-100" />
        {collapsed ? null : t('nav.collapse')}
      </button>
    </aside>
  );
}

/** Below 1024 px the same navigation opens as a drawer from the start edge. */
export function MobileNav({
  locale,
  groups,
  companyName,
}: {
  locale: Locale;
  groups: SidebarGroup[];
  companyName?: string;
}) {
  const t = createTranslator(locale);
  const [open, setOpen] = useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        aria-label={t('nav.openMenu')}
        className="flex size-10 items-center justify-center rounded-lg border border-[var(--color-border)] lg:hidden"
      >
        <Menu aria-hidden size={18} />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content
          dir={locale === 'ar' ? 'rtl' : 'ltr'}
          className="fixed inset-y-0 start-0 z-50 flex w-[280px] max-w-[85vw] flex-col bg-[var(--color-sidebar)] text-[var(--color-sidebar-text)]"
        >
          <Dialog.Title className="sr-only">{t('nav.mainLabel')}</Dialog.Title>
          <Dialog.Description className="sr-only">{companyName ?? ''}</Dialog.Description>
          <div className="flex items-center justify-between">
            <Brand collapsed={false} companyName={companyName} />
            <Dialog.Close
              aria-label={t('nav.closeMenu')}
              className="me-3 flex size-10 items-center justify-center rounded-lg"
            >
              <X aria-hidden size={18} />
            </Dialog.Close>
          </div>
          <NavList
            groups={groups}
            collapsed={false}
            label={t('nav.mainLabel')}
            onNavigate={() => setOpen(false)}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
