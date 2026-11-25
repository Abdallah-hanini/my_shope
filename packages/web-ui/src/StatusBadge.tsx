export type StatusTone = 'up' | 'down' | 'unknown';

export interface StatusBadgeProps {
  tone: StatusTone;
  /** Visible, translated label. Color is never the only signal (WCAG 1.4.1). */
  label: string;
}

const glyph: Record<StatusTone, string> = { up: '●', down: '▲', unknown: '◆' };

export function StatusBadge({ tone, label }: StatusBadgeProps) {
  return (
    <span className={`erp-badge erp-badge--${tone}`} data-tone={tone}>
      <span aria-hidden="true">{glyph[tone]}</span>
      <span>{label}</span>
    </span>
  );
}
