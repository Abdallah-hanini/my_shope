import { createTranslator, type Locale, type MessageKey } from '@erp/localization';
import { Badge } from '../ui';

const TONE: Record<string, 'neutral' | 'success' | 'warning' | 'danger' | 'info'> = {
  draft: 'neutral',
  approved: 'info',
  assigned: 'info',
  in_progress: 'warning',
  rework: 'danger',
  qc: 'warning',
  ready: 'success',
  delivered: 'neutral',
  cancelled: 'neutral',
};

export function JobStatus({ status, locale }: { status: string; locale: Locale }) {
  const t = createTranslator(locale);
  return <Badge tone={TONE[status] ?? 'neutral'}>{t(`job.status.${status}` as MessageKey)}</Badge>;
}
