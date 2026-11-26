import 'server-only';
import type { Branch, Role } from '@erp/api-client';
import type { Locale } from '@erp/localization';
import { localName } from './context';

export function roleLabel(r: Pick<Role, 'name' | 'nameAr' | 'code'>, locale: Locale): string {
  return locale === 'ar' && r.nameAr ? r.nameAr : r.name;
}

export function branchLabel(branches: Branch[], id: string | null, locale: Locale, allLabel: string): string {
  if (id === null) return allLabel;
  const b = branches.find((x) => x.id === id);
  return b ? `${b.code} — ${localName(b, locale)}` : id.slice(0, 8);
}
