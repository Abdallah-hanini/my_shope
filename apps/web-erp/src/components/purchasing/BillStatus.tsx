import { createTranslator, type Locale, type MessageKey } from '@erp/localization';
import { Badge } from '@/components/ui';

/** A supplier bill's state: open, overdue, paid or cancelled (T-76). */
export function BillStatus({
  locale,
  status,
  overdue,
}: {
  locale: Locale;
  status: string;
  overdue: boolean;
}) {
  const t = createTranslator(locale);
  if (overdue) return <Badge tone="danger">{t('pur.overdue')}</Badge>;
  const tone = status === 'paid' ? 'success' : status === 'open' ? 'warning' : 'neutral';
  return <Badge tone={tone}>{t(`pur.status.${status}` as MessageKey)}</Badge>;
}
