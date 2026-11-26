/** Date ranges for the ledger reports, in the company's time zone (no server-only imports). */
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function todayIn(timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function lastDay(year: number, month: number): string {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

export function ledgerPresets(timeZone: string) {
  const today = todayIn(timeZone);
  const [y, m] = today.split('-').map(Number) as [number, number];
  const prev = m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 };
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    thisMonth: { from: `${y}-${pad(m)}-01`, to: today },
    lastMonth: { from: `${prev.y}-${pad(prev.m)}-01`, to: lastDay(prev.y, prev.m) },
    thisYear: { from: `${y}-01-01`, to: today },
  };
}

/** Range from the URL; anything that is not a date falls back to this month. The API validates again. */
export function ledgerRange(timeZone: string, sp: { from?: string; to?: string }) {
  const def = ledgerPresets(timeZone).thisMonth;
  return {
    from: sp.from && DATE.test(sp.from) ? sp.from : def.from,
    to: sp.to && DATE.test(sp.to) ? sp.to : def.to,
  };
}

/** A signed balance (positive = debit) as an absolute amount and a side; zero has no side. */
export function drCr(signed: string): { amount: string; side: 'dr' | 'cr' | null } {
  const negative = signed.startsWith('-');
  const amount = negative ? signed.slice(1) : signed;
  const zero = /^0(\.0+)?$/.test(amount);
  return { amount, side: zero ? null : negative ? 'cr' : 'dr' };
}

export function query(params: Record<string, string | undefined | false>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `?${s}` : '';
}
