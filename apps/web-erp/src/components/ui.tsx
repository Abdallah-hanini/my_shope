import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * AUTO360 component library (docs/DESIGN_SYSTEM.md, identity v2). Logical CSS properties keep
 * every block correct in RTL; colours come from CSS variables so light and dark themes share one
 * markup. Server components only: interactive pieces live in their own client files.
 */

// ── page structure ───────────────────────────────────────────────────────────

export function PageHeader({
  title,
  actions,
  children,
  eyebrow,
  back,
}: {
  title: string;
  actions?: ReactNode;
  /** Supporting line under the title (status, key facts, help). */
  children?: ReactNode;
  /** Small label above the title (e.g. the record type). */
  eyebrow?: string;
  /** Link back to the list this record belongs to. */
  back?: { href: string; label: string };
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      {/* At least 18rem (or the full width): on phones the actions wrap below the title. */}
      <div className="min-w-[min(100%,18rem)] flex-1">
        {back ? (
          <Link
            href={back.href}
            className="mb-2 inline-flex items-center gap-1 text-[13px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          >
            <span aria-hidden className="rtl:-scale-x-100">
              ←
            </span>
            {back.label}
          </Link>
        ) : null}
        {eyebrow ? (
          <p className="mb-1 text-xs font-semibold tracking-wide text-[var(--color-primary)] uppercase">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-2xl leading-8 font-semibold tracking-tight text-balance">{title}</h1>
        {children ? (
          <div className="mt-1.5 max-w-3xl text-sm leading-6 text-[var(--color-text-muted)]">{children}</div>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Card({
  title,
  description,
  children,
  id,
  actions,
  className,
  flush,
}: {
  title?: string;
  /** One line under the title explaining what the card is for. */
  description?: ReactNode;
  children: ReactNode;
  id?: string;
  actions?: ReactNode;
  className?: string;
  /** No inner padding (for tables that span the card). */
  flush?: boolean;
}) {
  // The heading stays the header row's direct child when there is no description.
  const heading = (
    <h2 id={id ? `${id}-title` : undefined} className="text-[15px] leading-6 font-semibold">
      {title}
    </h2>
  );
  return (
    <section
      id={id}
      aria-labelledby={title && id ? `${id}-title` : undefined}
      className={cn(
        'mb-5 scroll-mt-32 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]',
        className,
      )}
    >
      {title ? (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--color-border)] px-5 py-3.5">
          {description ? (
            <div className="min-w-0">
              {heading}
              <p className="mt-0.5 text-[13px] text-[var(--color-text-muted)]">{description}</p>
            </div>
          ) : (
            heading
          )}
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className={flush ? '' : 'p-5'}>{children}</div>
    </section>
  );
}

/** A responsive grid of cards or blocks: one column on phones, `cols` from `lg` up. */
export function Grid({
  cols = 2,
  children,
  className,
}: {
  cols?: 2 | 3 | 4;
  children: ReactNode;
  className?: string;
}) {
  const c = { 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3', 4: 'sm:grid-cols-2 xl:grid-cols-4' }[cols];
  return <div className={cn('grid grid-cols-1 gap-x-5', c, className)}>{children}</div>;
}

/** Record page layout: main column and a narrower side column (stacks below 1280 px). */
export function SplitLayout({ main, side }: { main: ReactNode; side: ReactNode }) {
  // Nothing on the side (e.g. no permission to act): the main column takes the full width.
  if (side === null || side === undefined || side === false) return <div className="min-w-0">{main}</div>;
  return (
    <div className="grid grid-cols-1 gap-x-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0">{main}</div>
      <aside className="min-w-0">{side}</aside>
    </div>
  );
}

/** Link tabs (views of one page): the current one carries aria-current. */
export function Tabs({
  label,
  items,
  className,
}: {
  label: string;
  items: { href: string; label: string; current: boolean; count?: number }[];
  className?: string;
}) {
  return (
    <nav aria-label={label} className={cn('mb-4 border-b border-[var(--color-border)]', className)}>
      <ul className="-mb-px flex gap-1 overflow-x-auto scroll-quiet">
        {items.map((i) => (
          <li key={i.href}>
            <Link
              href={i.href}
              aria-current={i.current ? 'page' : undefined}
              className={cn(
                'inline-flex min-h-10 items-center gap-2 border-b-2 px-3 text-sm font-medium whitespace-nowrap',
                i.current
                  ? 'border-[var(--color-primary)] text-[var(--color-text)]'
                  : 'border-transparent text-[var(--color-text-muted)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)]',
              )}
            >
              {i.label}
              {i.count !== undefined ? (
                <span className="rounded-full bg-[var(--color-surface-muted)] px-1.5 text-xs tabular text-[var(--color-text-muted)]">
                  {i.count}
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Label/value pairs for record facts. */
export function DescriptionList({
  items,
  columns = 2,
}: {
  items: { label: string; value: ReactNode }[];
  columns?: 1 | 2 | 3;
}) {
  const c = { 1: '', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-2 lg:grid-cols-3' }[columns];
  return (
    <dl className={cn('grid grid-cols-1 gap-x-6 gap-y-3', c)}>
      {items.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="text-xs font-medium text-[var(--color-text-muted)]">{i.label}</dt>
          <dd className="mt-0.5 text-sm break-words">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

// ── feedback ─────────────────────────────────────────────────────────────────

export function Notice({
  tone = 'warning',
  children,
}: {
  tone?: 'warning' | 'danger' | 'success' | 'info';
  children: ReactNode;
}) {
  const color = {
    warning:
      'border-[var(--color-warning-brand)]/40 bg-[var(--color-warning-bg)] text-[var(--color-warning)]',
    danger: 'border-[var(--color-danger-brand)]/40 bg-[var(--color-danger-bg)] text-[var(--color-danger)]',
    success:
      'border-[var(--color-success-brand)]/40 bg-[var(--color-success-bg)] text-[var(--color-success)]',
    info: 'border-[var(--color-info)]/25 bg-[var(--color-info-bg)] text-[var(--color-info)]',
  }[tone];
  return (
    <p
      role={tone === 'danger' ? 'alert' : 'note'}
      className={cn('mb-4 rounded-[var(--radius-control)] border px-4 py-3 text-sm leading-6', color)}
    >
      {children}
    </p>
  );
}

/** Nothing to show yet: what this place is for and, when possible, the next step. */
export function EmptyState({
  children,
  title,
  action,
  icon,
}: {
  children?: ReactNode;
  title?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {icon ? (
        <span className="mb-3 flex size-10 items-center justify-center rounded-full bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]">
          {icon}
        </span>
      ) : null}
      {title ? <p className="text-sm font-semibold">{title}</p> : null}
      {children ? <p className="mt-1 max-w-md text-sm text-[var(--color-text-muted)]">{children}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/** Placeholder block while content loads (decorative; the region carries aria-busy). */
export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'block animate-pulse rounded-md bg-[var(--color-surface-muted)] motion-reduce:animate-none',
        className,
      )}
    />
  );
}

// ── controls ─────────────────────────────────────────────────────────────────

const buttonBase =
  'inline-flex min-h-10 items-center justify-center gap-2 rounded-[var(--radius-control)] px-4 text-sm font-medium whitespace-nowrap transition-[background-color,border-color,color,box-shadow] duration-150 focus-visible:shadow-[var(--shadow-focus)] disabled:cursor-not-allowed disabled:opacity-55';
export const buttonPrimary = `${buttonBase} bg-[var(--color-primary)] text-[var(--color-on-primary)] shadow-[0_1px_0_rgb(0_0_0/0.06)] hover:bg-[var(--color-primary-hover)]`;
export const buttonSecondary = `${buttonBase} border border-[var(--color-border-strong)] bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]`;
export const buttonGhost = `${buttonBase} text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]`;
export const buttonDanger = `${buttonBase} border border-[var(--color-danger-brand)]/50 bg-[var(--color-surface)] text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)]`;
/** Compact size for buttons inside tables and toolbars (combine with a variant). */
export const buttonSm = 'min-h-8 px-3 text-[13px]';

export const inputClass =
  'min-h-10 w-full rounded-[var(--radius-control)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-text)] transition-[border-color,box-shadow] duration-150 placeholder:text-[var(--color-text-muted)] hover:border-[var(--color-text-muted)]/60 focus:border-[var(--color-primary)] focus:shadow-[var(--shadow-focus)] focus:outline-none disabled:cursor-not-allowed disabled:bg-[var(--color-surface-muted)] aria-[invalid=true]:border-[var(--color-danger-brand)]';

/** A label wrapping its control (label text above, control below). */
export const fieldLabel = 'flex min-w-0 flex-col gap-1.5 text-[13px] font-medium text-[var(--color-text)]';

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

// ── data display ─────────────────────────────────────────────────────────────

export function Table({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    // "relative": screen-reader-only (absolutely positioned) text inside cells stays inside the
    // scroll area instead of widening the page on phones.
    <div className="relative overflow-x-auto scroll-quiet">
      <table className="w-full border-collapse text-sm [&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-[var(--color-surface-muted)]/60 [&_tbody_tr:last-child>td]:border-b-0">
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}

const thBase =
  'border-b border-[var(--color-border)] bg-[var(--color-surface-muted)]/70 px-4 py-2.5 text-xs font-medium whitespace-nowrap text-[var(--color-text-muted)]';
/** Header cell (start-aligned; flips correctly in RTL). */
export const th = `${thBase} text-start`;
/** Header cell for numeric columns (end-aligned like the amounts below it). */
export const thNum = `${thBase} text-end`;
export const td = 'border-b border-[var(--color-border)] px-4 py-3 align-top';
export const tdNum = `${td} text-end whitespace-nowrap tabular`;

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
    neutral: 'bg-[var(--color-surface-muted)] text-[var(--color-text-muted)] ring-[var(--color-border)]',
    success: 'bg-[var(--color-success-bg)] text-[var(--color-success)] ring-[var(--color-success-brand)]/25',
    warning: 'bg-[var(--color-warning-bg)] text-[var(--color-warning)] ring-[var(--color-warning-brand)]/30',
    danger: 'bg-[var(--color-danger-bg)] text-[var(--color-danger)] ring-[var(--color-danger-brand)]/25',
    info: 'bg-[var(--color-info-bg)] text-[var(--color-info)] ring-[var(--color-info)]/20',
  }[tone];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset',
        color,
      )}
    >
      {children}
    </span>
  );
}

/** A page-header action that jumps to a form further down the same page (e.g. "Add part"). */
export function JumpAction({ href, label }: { href: `#${string}`; label: string }) {
  return (
    <a href={href} className={buttonPrimary}>
      <span aria-hidden className="text-base leading-none">
        +
      </span>
      {label}
    </a>
  );
}

export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="font-medium text-[var(--color-primary)] hover:underline">
      {children}
    </Link>
  );
}
