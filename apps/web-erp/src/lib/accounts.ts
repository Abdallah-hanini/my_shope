import type { Account } from '@erp/api-client';
import type { Locale } from '@erp/localization';
import { localName } from './context';

/** Chart of accounts in display order with depth for indentation (parents before children). */
export function accountTree(accounts: Account[]): { account: Account; depth: number }[] {
  const byParent = new Map<string | null, Account[]>();
  for (const a of accounts) {
    const key = a.parentId ?? null;
    byParent.set(key, [...(byParent.get(key) ?? []), a]);
  }
  const out: { account: Account; depth: number }[] = [];
  const seen = new Set<string>();
  const walk = (parent: string | null, depth: number) => {
    for (const a of (byParent.get(parent) ?? []).sort((x, y) => x.code.localeCompare(y.code))) {
      if (seen.has(a.id)) continue;
      seen.add(a.id);
      out.push({ account: a, depth });
      walk(a.id, depth + 1);
    }
  };
  walk(null, 0);
  // Orphans (parent not visible) are listed at the end rather than hidden.
  for (const a of accounts) if (!seen.has(a.id)) out.push({ account: a, depth: 0 });
  return out;
}

export function accountLabel(a: Account, locale: Locale): string {
  return `${a.code} — ${localName(a, locale)}`;
}
