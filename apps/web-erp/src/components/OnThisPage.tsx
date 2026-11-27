'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';

/**
 * Section links for long record pages, pinned under the header. Only sections present on the page
 * are offered (a link never points nowhere), and the one in view is marked as current.
 */
export function OnThisPage({ label, items }: { label: string; items: { id: string; label: string }[] }) {
  const [present, setPresent] = useState<string[]>([]);
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    const found = items.filter((i) => document.getElementById(i.id));
    setPresent(found.map((i) => i.id));
    const seen = new Map<string, boolean>();
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target.id, e.isIntersecting);
        setActive(found.find((i) => seen.get(i.id))?.id ?? null);
      },
      { rootMargin: '-120px 0px -55% 0px' },
    );
    for (const i of found) obs.observe(document.getElementById(i.id)!);
    return () => obs.disconnect();
  }, [items]);
  const shown = items.filter((i) => present.includes(i.id));
  if (shown.length < 3) return null;
  return (
    <nav
      aria-label={label}
      className="sticky top-14 z-20 -mx-4 mb-5 border-b border-[var(--color-border)] bg-[var(--color-background)]/90 px-4 backdrop-blur-md sm:-mx-7 sm:px-7 print:hidden"
    >
      <ul className="scroll-quiet flex gap-1 overflow-x-auto py-2">
        {shown.map((i) => (
          <li key={i.id}>
            <a
              href={`#${i.id}`}
              aria-current={active === i.id ? 'location' : undefined}
              className={cn(
                'inline-flex min-h-8 items-center rounded-full px-3 text-[13px] font-medium whitespace-nowrap transition-colors',
                active === i.id
                  ? 'bg-[var(--color-primary-soft)] text-[var(--color-primary)]'
                  : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)]',
              )}
            >
              {i.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
