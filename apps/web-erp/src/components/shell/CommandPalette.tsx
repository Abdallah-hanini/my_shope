'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { createTranslator, type Locale } from '@erp/localization';
import { Command, CornerDownLeft, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { normalizeSearch } from '@/lib/search-text';
import type { SidebarGroup } from './Sidebar';

/**
 * Quick jump (Ctrl/⌘ + K): type to filter the pages this person can open (the same role-filtered
 * list as the sidebar), arrow keys to move, Enter to open. A combobox with a listbox, so screen
 * readers announce the active option.
 */
export function CommandPalette({
  locale,
  groups,
  open,
  onOpenChange,
}: {
  locale: Locale;
  groups: SidebarGroup[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = createTranslator(locale);
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const entries = useMemo(
    () => groups.flatMap((g) => g.items.map((i) => ({ ...i, group: g.label ?? '' }))),
    [groups],
  );
  const matches = useMemo(() => {
    const q = normalizeSearch(query);
    if (!q) return entries;
    return entries.filter((e) => normalizeSearch(`${e.label} ${e.group}`).includes(q));
  }, [entries, query]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setIndex(0);
    }
  }, [open]);
  useEffect(() => setIndex(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndex((i) => Math.min(i + 1, matches.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && matches[index]) {
      e.preventDefault();
      go(matches[index].href);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[1px]" />
        <Dialog.Content
          dir={locale === 'ar' ? 'rtl' : 'ltr'}
          className="fixed inset-x-4 top-[12vh] z-50 mx-auto max-w-xl overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface-raised)] text-[var(--color-text)] shadow-[var(--shadow-raised)]"
        >
          <Dialog.Title className="sr-only">{t('palette.title')}</Dialog.Title>
          <Dialog.Description className="sr-only">{t('palette.help')}</Dialog.Description>
          <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4">
            <Search aria-hidden size={16} className="shrink-0 text-[var(--color-text-muted)]" />
            <input
              autoFocus
              role="combobox"
              aria-expanded="true"
              aria-controls="palette-list"
              aria-activedescendant={matches[index] ? `palette-${index}` : undefined}
              aria-label={t('palette.title')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKey}
              placeholder={t('palette.placeholder')}
              className="h-12 w-full bg-transparent text-[15px] outline-none placeholder:text-[var(--color-text-muted)]"
            />
          </div>
          <ul
            id="palette-list"
            role="listbox"
            ref={listRef}
            className="scroll-quiet max-h-[50vh] overflow-y-auto p-1.5"
          >
            {matches.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-[var(--color-text-muted)]">
                {t('palette.none')}
              </li>
            ) : (
              matches.map((m, i) => (
                <li
                  key={m.href}
                  id={`palette-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={i === index}
                  onMouseMove={() => setIndex(i)}
                  onClick={() => go(m.href)}
                  className={cn(
                    'flex cursor-pointer items-center justify-between gap-3 rounded-[var(--radius-control)] px-3 py-2 text-sm',
                    i === index && 'bg-[var(--color-primary-soft)] text-[var(--color-primary)]',
                  )}
                >
                  <span className="truncate font-medium">{m.label}</span>
                  <span className="flex shrink-0 items-center gap-2 text-xs text-[var(--color-text-muted)]">
                    {m.group}
                    {i === index ? (
                      <CornerDownLeft aria-hidden size={14} className="rtl:-scale-x-100" />
                    ) : null}
                  </span>
                </li>
              ))
            )}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Header button and the global Ctrl/⌘ + K shortcut that open the quick-jump palette. */
export function QuickJump({ locale, groups }: { locale: Locale; groups: SidebarGroup[] }) {
  const t = createTranslator(locale);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('palette.open')}
        title={t('palette.open')}
        aria-keyshortcuts="Control+K Meta+K"
        className="inline-flex size-10 items-center justify-center rounded-[var(--radius-control)] border border-[var(--color-border)] transition-colors hover:bg-[var(--color-surface-muted)]"
      >
        <Command aria-hidden size={16} />
      </button>
      <CommandPalette locale={locale} groups={groups} open={open} onOpenChange={setOpen} />
    </>
  );
}
