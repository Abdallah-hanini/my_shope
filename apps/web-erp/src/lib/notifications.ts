import { createTranslator, type Locale, type MessageKey } from '@erp/localization';

export interface NotificationLike {
  kind: string;
  params: Record<string, string | null | undefined>;
}

/** Replaces {name} placeholders; unknown placeholders are left visible rather than guessed. */
export function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => values[k] ?? m);
}

/**
 * The message text in the reader's language. Names of people, roles, periods and files come from
 * the event; missing values get neutral wording instead of an empty gap.
 */
export function renderNotification(n: NotificationLike, locale: Locale): string {
  const t = createTranslator(locale);
  const p = n.params;
  const role = (locale === 'ar' && p.roleAr ? p.roleAr : p.role) ?? t('notify.aRole');
  const values: Record<string, string> = {
    actor: p.actor ?? t('notify.someone'),
    number: p.number ?? '—',
    reversalNumber: p.reversalNumber ?? '—',
    role,
    branch: p.branch ?? t('common.allBranches'),
    period: p.period ?? '—',
    plate: p.plate ?? '—',
    task: p.task ?? '—',
    finding: p.finding ?? '—',
    part: p.part ?? '—',
    exportKind: p.exportKind ? t(`export.kind.${p.exportKind}` as MessageKey) : '—',
    fileName: p.fileName ?? '—',
    error: p.error ?? t('error.title'),
  };
  const kind = n.kind === 'role_revoked' && !p.role ? 'role_revoked_unknown' : n.kind;
  return fill(t(`notify.kind.${kind}` as MessageKey), values);
}
