import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * AUTO360 building blocks (docs/DESIGN_SYSTEM.md). Logical CSS properties keep them correct in
 * RTL; colours come from CSS variables so light and dark themes share one markup.
 */

export function PageHeader({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[28px] leading-9 font-semibold tracking-tight">{title}</h1>
        {children ? <div className="mt-1 text-sm text-[var(--color-text-muted)]">{children}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function Card({
  title,
  children,
  id,
  actions,
  className,
  flush,
}: {
  title?: string;
  children: ReactNode;
  id?: string;
  actions?: ReactNode;
  className?: string;
  /** No inner padding (for tables that span the card). */
  flush?: boolean;
}) {
  return (
    <section
      aria-labelledby={title && id ? `${id}-title` : undefined}
      className={cn(
        'mb-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]',
        className,
      )}
    >
      {title ? (
        <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] px-5 py-3">
          <h2 id={id ? `${id}-title` : undefined} className="text-base font-semibold">
            {title}
          </h2>
          {actions}
        </div>
      ) : null}
      <div className={flush ? '' : 'p-5'}>{children}</div>
    </section>
  );
}

export function Notice({
  tone = 'warning',
  children,
}: {
  tone?: 'warning' | 'danger' | 'success';
  children: ReactNode;
}) {
  const color = {
    warning: 'border-[var(--color-warning-brand)] bg-[var(--color-warning-bg)] text-[var(--color-warning)]',
    danger: 'border-[var(--color-danger-brand)] bg-[var(--color-danger-bg)] text-[var(--color-danger)]',
    success: 'border-[var(--color-success-brand)] bg-[var(--color-success-bg)] text-[var(--color-success)]',
  }[tone];
  return (
    <p
      role={tone === 'danger' ? 'alert' : 'note'}
      className={cn('mb-4 rounded-lg border-s-4 px-4 py-3 text-sm', color)}
    >
      {children}
    </p>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="px-5 py-10 text-center text-sm text-[var(--color-text-muted)]">{children}</p>;
}

const buttonBase =
  'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-60';
export const buttonPrimary = `${buttonBase} bg-[var(--color-primary)] text-[var(--color-on-primary)] hover:brightness-110`;
export const buttonSecondary = `${buttonBase} border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-muted)]`;
export const buttonGhost = `${buttonBase} hover:bg-[var(--color-surface-muted)]`;

export const inputClass =
  'min-h-10 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm aria-[invalid=true]:border-[var(--color-danger-brand)]';

export function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium">
        {label}
      </label>
      {children}
      {hint ? (
        <p id={`${id}-hint`} className="text-xs text-[var(--color-text-muted)]">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-xs font-medium text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Table({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    // "relative": screen-reader-only (absolutely positioned) text inside cells stays inside the
    // scroll area instead of widening the page on phones.
    <div className="relative overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}

const thBase =
  'border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-2.5 text-xs font-semibold tracking-wide text-[var(--color-text-muted)] uppercase';
/** Header cell (start-aligned; flips correctly in RTL). */
export const th = `${thBase} text-start`;
/** Header cell for numeric columns (end-aligned like the amounts below it). */
export const thNum = `${thBase} text-end`;
export const td = 'border-b border-[var(--color-border)] px-4 py-3 align-top';
export const tdNum = `${td} text-end whitespace-nowrap`;

/** Money and codes stay left-to-right inside RTL text. */
export function Ltr({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span dir="ltr" className={cn('inline-block tabular', className)}>
      {children}
    </span>
  );
}

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
  children: ReactNode;
}) {
  const color = {
    neutral: 'bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]',
    success: 'bg-[var(--color-success-bg)] text-[var(--color-success)]',
    warning: 'bg-[var(--color-warning-bg)] text-[var(--color-warning)]',
    danger: 'bg-[var(--color-danger-bg)] text-[var(--color-danger)]',
    info: 'bg-[var(--color-surface-muted)] text-[var(--color-primary)]',
  }[tone];
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap',
        color,
      )}
    >
      {children}
    </span>
  );
}

export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="font-medium text-[var(--color-primary)] hover:underline">
      {children}
    </Link>
  );
}
