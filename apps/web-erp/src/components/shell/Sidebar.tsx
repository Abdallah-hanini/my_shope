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
  Percent,
  Tags,
  Package,
  Boxes,
  Truck,
  PackageSearch,
  ArrowLeftRight,
  BarChart3,
  ReceiptText,
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
  Percent,
  Tags,
  Package,
  Boxes,
  Truck,
  PackageSearch,
  ArrowLeftRight,
  BarChart3,
  ReceiptText,
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
    <nav aria-label={label} className="scroll-quiet flex-1 overflow-y-auto px-2.5 py-3">
      {groups.map((g, gi) => (
        <div key={gi} className="mb-4 last:mb-0">
          {g.label && !collapsed ? (
            <p className="mb-1 px-2.5 text-[11px] font-semibold tracking-wide text-[var(--color-sidebar-muted)] uppercase">
              {g.label}
            </p>
          ) : collapsed && gi > 0 ? (
            <hr className="mx-3 mb-3 border-[var(--color-border)]" />
          ) : null}
          <ul className="flex flex-col gap-px">
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
                      'group flex min-h-9 items-center gap-2.5 rounded-[var(--radius-control)] px-2.5 text-[13.5px] text-[var(--color-sidebar-text)] transition-colors hover:bg-[var(--color-surface-muted)]',
                      active &&
                        'bg-[var(--color-sidebar-active)] font-semibold text-[var(--color-primary)] hover:bg-[var(--color-sidebar-active)]',
                      collapsed && 'justify-center px-0',
                    )}
                  >
                    <Icon
                      aria-hidden
                      size={17}
                      strokeWidth={active ? 2.2 : 1.8}
                      className={cn(
                        'shrink-0',
                        active
                          ? 'text-[var(--color-primary)]'
                          : 'text-[var(--color-sidebar-muted)] group-hover:text-[var(--color-sidebar-text)]',
                      )}
                    />
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
    <div className={cn('flex h-14 shrink-0 items-center gap-2.5 px-4', collapsed && 'justify-center px-0')}>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-[var(--color-primary)] text-[var(--color-on-primary)] shadow-[inset_0_-1px_0_rgb(0_0_0/0.15)]">
        <CarFront aria-hidden size={17} strokeWidth={2.2} />
      </span>
      {collapsed ? null : (
        <span className="min-w-0">
          <span
            className="block text-[14px] leading-5 font-semibold tracking-tight text-[var(--color-sidebar-text)]"
            dir="ltr"
          >
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

/** Desktop sidebar: 244 px expanded, 68 px collapsed (preference kept in a cookie). */
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
        'sticky top-0 hidden h-dvh shrink-0 flex-col border-e border-[var(--color-border)] bg-[var(--color-sidebar)] text-[var(--color-sidebar-text)] lg:flex print:hidden',
        collapsed ? 'w-[68px]' : 'w-[244px]',
      )}
    >
      <Brand collapsed={collapsed} companyName={companyName} />
      <NavList groups={groups} collapsed={collapsed} label={t('nav.mainLabel')} />
      <button
        type="button"
        onClick={toggle}
        aria-label={collapsed ? t('nav.expand') : t('nav.collapse')}
        aria-expanded={!collapsed}
        className="mx-2.5 mb-3 flex min-h-9 items-center justify-center gap-2 rounded-[var(--radius-control)] border-t border-transparent text-[13px] text-[var(--color-sidebar-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-sidebar-text)]"
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
        className="flex size-10 items-center justify-center rounded-[var(--radius-control)] border border-[var(--color-border-strong)] hover:bg-[var(--color-surface-muted)] lg:hidden"
      >
        <Menu aria-hidden size={18} />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]" />
        <Dialog.Content
          dir={locale === 'ar' ? 'rtl' : 'ltr'}
          className="fixed inset-y-0 start-0 z-50 flex w-[280px] max-w-[85vw] flex-col border-e border-[var(--color-border)] bg-[var(--color-sidebar)] text-[var(--color-sidebar-text)] shadow-[var(--shadow-raised)]"
        >
          <Dialog.Title className="sr-only">{t('nav.mainLabel')}</Dialog.Title>
          <Dialog.Description className="sr-only">{companyName ?? ''}</Dialog.Description>
          <div className="flex items-center justify-between">
            <Brand collapsed={false} companyName={companyName} />
            <Dialog.Close
              aria-label={t('nav.closeMenu')}
              className="me-3 flex size-10 items-center justify-center rounded-[var(--radius-control)] hover:bg-[var(--color-surface-muted)]"
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
