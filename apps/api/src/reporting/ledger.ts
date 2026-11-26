import { Prisma } from '@prisma/client';
import type { LedgerSums } from './kpi';

/**
 * Pure trial-balance and general-ledger arithmetic (docs/KPI_DICTIONARY.md, "Ledger reports").
 * Balances are signed exact decimals: positive = debit balance, negative = credit balance.
 */
const ZERO = new Prisma.Decimal(0);

export interface TbAccount {
  id: string;
  code: string;
  name: string;
  nameAr: string | null;
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  reportingClass: string | null;
  isPosting: boolean;
  parentId: string | null;
}

export interface TbMovement {
  /** Σ(debit − credit) before the range. */
  opening: Prisma.Decimal;
  periodDebit: Prisma.Decimal;
  periodCredit: Prisma.Decimal;
}

export interface TbRow extends TbMovement {
  account: TbAccount;
  level: number;
  closing: Prisma.Decimal;
}

export interface TbTotals {
  openingDebit: Prisma.Decimal;
  openingCredit: Prisma.Decimal;
  periodDebit: Prisma.Decimal;
  periodCredit: Prisma.Decimal;
  closingDebit: Prisma.Decimal;
  closingCredit: Prisma.Decimal;
}

const empty = (): TbMovement => ({ opening: ZERO, periodDebit: ZERO, periodCredit: ZERO });
const add = (a: TbMovement, b: TbMovement): TbMovement => ({
  opening: a.opening.plus(b.opening),
  periodDebit: a.periodDebit.plus(b.periodDebit),
  periodCredit: a.periodCredit.plus(b.periodCredit),
});
const isZero = (m: TbMovement) => m.opening.isZero() && m.periodDebit.isZero() && m.periodCredit.isZero();

/**
 * Rows in chart-of-accounts order (depth first, by code). Header accounts show the sum of their
 * descendants; totals count posting accounts only, so nothing is counted twice.
 */
export function buildTrialBalance(
  accounts: TbAccount[],
  movements: Map<string, TbMovement>,
  includeZero: boolean,
): { rows: TbRow[]; totals: TbTotals; balanced: boolean; result: LedgerSums } {
  const children = new Map<string | null, TbAccount[]>();
  const ids = new Set(accounts.map((a) => a.id));
  for (const a of accounts) {
    // An unknown parent (should not happen: FK) is treated as top level rather than hiding the account.
    const parent = a.parentId && ids.has(a.parentId) ? a.parentId : null;
    children.set(parent, [...(children.get(parent) ?? []), a]);
  }
  for (const list of children.values()) list.sort((x, y) => x.code.localeCompare(y.code, 'en'));

  const rows: TbRow[] = [];
  const seen = new Set<string>();
  /** Returns the subtree movement and whether any posting account in it has a non-zero figure. */
  const walk = (a: TbAccount, level: number): { m: TbMovement; active: boolean } => {
    if (seen.has(a.id)) return { m: empty(), active: false }; // defensive: the database forbids cycles
    seen.add(a.id);
    const row: TbRow = { account: a, level, ...empty(), closing: ZERO };
    rows.push(row);
    const at = rows.length - 1;
    let m = a.isPosting ? (movements.get(a.id) ?? empty()) : empty();
    let active = a.isPosting && !isZero(m);
    for (const c of children.get(a.id) ?? []) {
      const sub = walk(c, level + 1);
      m = add(m, sub.m);
      active ||= sub.active;
    }
    Object.assign(row, m, { closing: m.opening.plus(m.periodDebit).minus(m.periodCredit) });
    if (!includeZero && !active) rows.splice(at, rows.length - at);
    return { m, active };
  };
  for (const top of children.get(null) ?? []) walk(top, 0);

  const totals: TbTotals = {
    openingDebit: ZERO,
    openingCredit: ZERO,
    periodDebit: ZERO,
    periodCredit: ZERO,
    closingDebit: ZERO,
    closingCredit: ZERO,
  };
  const result: LedgerSums = { revenue: ZERO, cogs: ZERO, operatingExpenses: ZERO };
  for (const a of accounts) {
    if (!a.isPosting) continue;
    const m = movements.get(a.id) ?? empty();
    const closing = m.opening.plus(m.periodDebit).minus(m.periodCredit);
    totals.openingDebit = totals.openingDebit.plus(Prisma.Decimal.max(m.opening, ZERO));
    totals.openingCredit = totals.openingCredit.plus(Prisma.Decimal.max(m.opening.negated(), ZERO));
    totals.periodDebit = totals.periodDebit.plus(m.periodDebit);
    totals.periodCredit = totals.periodCredit.plus(m.periodCredit);
    totals.closingDebit = totals.closingDebit.plus(Prisma.Decimal.max(closing, ZERO));
    totals.closingCredit = totals.closingCredit.plus(Prisma.Decimal.max(closing.negated(), ZERO));
    // Period result uses the same classification as the executive dashboard (kpi.ts).
    const net = m.periodDebit.minus(m.periodCredit);
    if (a.type === 'revenue') result.revenue = result.revenue.minus(net);
    else if (a.type === 'expense' && a.reportingClass === 'cogs') result.cogs = result.cogs.plus(net);
    else if (a.type === 'expense') result.operatingExpenses = result.operatingExpenses.plus(net);
  }
  const balanced =
    totals.openingDebit.equals(totals.openingCredit) &&
    totals.periodDebit.equals(totals.periodCredit) &&
    totals.closingDebit.equals(totals.closingCredit);
  return { rows, totals, balanced, result };
}

/** Position of a ledger line in (posting date, journal number, line number) order. */
export interface LedgerCursor {
  date: string;
  number: string;
  lineNo: number;
}

export function encodeCursor(c: LedgerCursor): string {
  return Buffer.from(JSON.stringify([c.date, c.number, c.lineNo])).toString('base64url');
}

/** Returns null for anything that is not a cursor this API produced. */
export function decodeCursor(raw: string): LedgerCursor | null {
  try {
    const v: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (
      Array.isArray(v) &&
      v.length === 3 &&
      typeof v[0] === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(v[0]) &&
      typeof v[1] === 'string' &&
      v[1].length > 0 &&
      v[1].length <= 64 &&
      Number.isInteger(v[2]) &&
      (v[2] as number) > 0
    ) {
      return { date: v[0], number: v[1], lineNo: v[2] as number };
    }
  } catch {
    // fall through
  }
  return null;
}
