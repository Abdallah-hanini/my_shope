import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function KpiCard({
  label,
  value,
  currency,
  sub,
  icon: Icon,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  currency?: string;
  sub?: ReactNode;
  icon: LucideIcon;
  tone?: 'neutral' | 'positive' | 'negative';
}) {
  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-medium text-[var(--color-text-muted)]">{label}</p>
        <span className="flex size-8 items-center justify-center rounded-[var(--radius-control)] bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
          <Icon aria-hidden size={16} />
        </span>
      </div>
      <p
        dir="ltr"
        className={cn(
          'tabular text-2xl leading-8 font-semibold tracking-tight rtl:text-end',
          tone === 'negative' && 'text-[var(--color-danger)]',
        )}
      >
        {value}
        {currency ? (
          <span className="ms-1 text-sm font-medium text-[var(--color-text-muted)]">{currency}</span>
        ) : null}
      </p>
      {sub ? <div className="text-xs text-[var(--color-text-muted)]">{sub}</div> : null}
    </div>
  );
}
