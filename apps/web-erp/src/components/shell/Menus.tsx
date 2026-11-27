'use client';

import * as Dropdown from '@radix-ui/react-dropdown-menu';
import { createTranslator, type Locale } from '@erp/localization';
import { Building2, Check, ChevronsUpDown, LogOut, Plus, UserRound } from 'lucide-react';
import Link from 'next/link';
import { ThemeMenu } from './ThemeMenu';

const panel =
  'z-50 min-w-60 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-1.5 text-[var(--color-text)] shadow-[var(--shadow-raised)]';
const item =
  'flex min-h-10 cursor-pointer items-center gap-2 rounded-md px-2 text-sm outline-none data-[highlighted]:bg-[var(--color-surface-muted)]';

export function CompanySwitcher({
  locale,
  current,
  companies,
  canCreate,
}: {
  locale: Locale;
  current?: { id: string; name: string };
  companies: { id: string; name: string; code: string }[];
  canCreate: boolean;
}) {
  const t = createTranslator(locale);
  if (!current && !companies.length) return null;
  return (
    <Dropdown.Root dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <Dropdown.Trigger
        aria-label={t('nav.switchCompany')}
        className="flex min-h-10 max-w-64 items-center gap-2 rounded-[var(--radius-control)] border border-[var(--color-border)] hover:bg-[var(--color-surface-muted)] transition-colors px-3 text-sm font-medium"
      >
        <Building2 aria-hidden size={16} className="shrink-0 text-[var(--color-text-muted)]" />
        <span className="truncate">{current?.name ?? t('nav.companies')}</span>
        <ChevronsUpDown aria-hidden size={14} className="shrink-0 text-[var(--color-text-muted)]" />
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content align="end" sideOffset={6} className={panel}>
          <Dropdown.Label className="px-2 py-1 text-xs font-semibold text-[var(--color-text-muted)]">
            {t('nav.companies')}
          </Dropdown.Label>
          {companies.map((c) => (
            <Dropdown.Item key={c.id} asChild className={item}>
              <Link href={`/${locale}/c/${c.id}`}>
                <Check aria-hidden size={14} className={c.id === current?.id ? '' : 'invisible'} />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{c.name}</span>
                  <span dir="ltr" className="text-xs text-[var(--color-text-muted)]">
                    {c.code}
                  </span>
                </span>
              </Link>
            </Dropdown.Item>
          ))}
          {canCreate ? (
            <>
              <Dropdown.Separator className="my-1 h-px bg-[var(--color-border)]" />
              <Dropdown.Item asChild className={item}>
                <Link href={`/${locale}/companies/new`}>
                  <Plus aria-hidden size={14} />
                  {t('company.new')}
                </Link>
              </Dropdown.Item>
            </>
          ) : null}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}

export function ProfileMenu({
  locale,
  name,
  email,
  theme,
}: {
  locale: Locale;
  name: string;
  email?: string;
  theme: 'light' | 'dark' | 'system';
}) {
  const t = createTranslator(locale);
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <Dropdown.Root dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <Dropdown.Trigger
        aria-label={`${t('nav.profile')}: ${name}`}
        className="flex size-10 items-center justify-center rounded-full bg-[var(--color-primary)] text-sm font-semibold text-[var(--color-on-primary)]"
      >
        {initials || <UserRound aria-hidden size={18} />}
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content align="end" sideOffset={6} className={panel}>
          <div className="px-2 py-2">
            <p className="text-xs text-[var(--color-text-muted)]">{t('auth.signedInAs')}</p>
            <p className="truncate text-sm font-semibold">{name}</p>
            {email ? (
              <p dir="ltr" className="truncate text-xs text-[var(--color-text-muted)]">
                {email}
              </p>
            ) : null}
          </div>
          <Dropdown.Separator className="my-1 h-px bg-[var(--color-border)]" />
          <div className="py-1">
            <ThemeMenu locale={locale} initial={theme} />
          </div>
          <Dropdown.Separator className="my-1 h-px bg-[var(--color-border)]" />
          <form action="/session/logout" method="post">
            <button type="submit" className={`${item} w-full text-[var(--color-danger)]`}>
              <LogOut aria-hidden size={16} />
              {t('auth.signOut')}
            </button>
          </form>
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
