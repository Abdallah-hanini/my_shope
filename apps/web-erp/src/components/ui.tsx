import type { ReactNode } from 'react';

/** Shared, accessible building blocks. Logical CSS properties keep them correct in RTL. */

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
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {children ? <div className="mt-1 text-[var(--color-text-muted)]">{children}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function Card({ title, children, id }: { title?: string; children: ReactNode; id?: string }) {
  return (
    <section
      aria-labelledby={title && id ? `${id}-title` : undefined}
      className="mb-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]"
    >
      {title ? (
        <h2
          id={id ? `${id}-title` : undefined}
          className="border-b border-[var(--color-border)] px-4 py-3 text-lg font-semibold"
        >
          {title}
        </h2>
      ) : null}
      <div className="p-4">{children}</div>
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
    warning: 'bg-[var(--color-warning-bg)] text-[var(--color-warning)]',
    danger: 'bg-[var(--color-danger-bg)] text-[var(--color-danger)]',
    success: 'bg-[var(--color-success-bg)] text-[var(--color-success)]',
  }[tone];
  return (
    <p role={tone === 'danger' ? 'alert' : 'note'} className={`mb-4 rounded-lg p-3 ${color}`}>
      {children}
    </p>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-[var(--color-text-muted)]">{children}</p>;
}

const buttonBase =
  'inline-flex min-h-11 items-center justify-center rounded-lg px-4 font-semibold disabled:cursor-not-allowed disabled:opacity-60';
export const buttonPrimary = `${buttonBase} bg-[var(--color-primary)] text-white dark:text-[#0b1020]`;
export const buttonSecondary = `${buttonBase} border border-[var(--color-border)]`;

export const inputClass =
  'min-h-11 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 aria-[invalid=true]:border-[var(--color-danger)]';

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
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      {children}
      {hint ? (
        <p id={`${id}-hint`} className="text-sm text-[var(--color-text-muted)]">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Table({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-start">
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}

const thBase = 'border-b border-[var(--color-border)] px-3 py-2 text-sm font-semibold';
/** Header cell (start-aligned; flips correctly in RTL). */
export const th = `${thBase} text-start`;
/** Header cell for numeric columns (end-aligned like the amounts below it). */
export const thNum = `${thBase} text-end`;
export const td = 'border-b border-[var(--color-border)] px-3 py-2 align-top';

/** Money and codes stay left-to-right inside RTL text. */
export function Ltr({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span dir="ltr" className={`inline-block tabular-nums ${className}`}>
      {children}
    </span>
  );
}
