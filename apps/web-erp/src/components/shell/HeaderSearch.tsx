'use client';

import { createTranslator, type Locale } from '@erp/localization';
import { Search } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';

/** Typing "/" (outside a field) or Ctrl/⌘+K focuses the search box. */
function isTyping(el: EventTarget | null): boolean {
  return (
    el instanceof HTMLElement &&
    (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))
  );
}

/**
 * WEB-237 entry point in the header: a plain GET form to the search page (works without
 * JavaScript). Phones get a search icon link instead of the field.
 */
export function HeaderSearch({ locale, action }: { locale: Locale; action: string }) {
  const t = createTranslator(locale);
  const ref = useRef<HTMLInputElement>(null);
  const current = useSearchParams().get('q') ?? '';
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (
        (k === 'k' && (e.metaKey || e.ctrlKey)) ||
        (k === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !isTyping(e.target))
      ) {
        if (!ref.current || ref.current.offsetParent === null) return; // hidden (phone layout)
        e.preventDefault();
        ref.current.focus();
        ref.current.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <>
      <form role="search" action={action} method="get" className="relative hidden lg:block">
        <label htmlFor="global-search" className="sr-only">
          {t('search.label')}
        </label>
        <Search
          aria-hidden
          size={16}
          className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]"
        />
        <input
          ref={ref}
          id="global-search"
          name="q"
          type="search"
          minLength={2}
          maxLength={100}
          required
          key={current}
          defaultValue={current}
          placeholder={t('search.placeholder')}
          aria-describedby="global-search-hint"
          className="h-10 w-56 rounded-lg 2xl:w-72 border border-[var(--color-border)] bg-[var(--color-surface)] ps-9 pe-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
        />
        <kbd
          aria-hidden
          className="pointer-events-none absolute end-2 top-1/2 -translate-y-1/2 rounded border border-[var(--color-border)] px-1.5 text-xs text-[var(--color-text-muted)]"
        >
          /
        </kbd>
        <span id="global-search-hint" className="sr-only">
          {t('search.shortcut')}
        </span>
      </form>
      <Link
        href={action}
        aria-label={t('search.label')}
        className="inline-flex size-10 items-center justify-center rounded-lg border border-[var(--color-border)] lg:hidden"
      >
        <Search aria-hidden size={18} />
      </Link>
    </>
  );
}
