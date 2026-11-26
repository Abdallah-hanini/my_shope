import { Prisma } from '@prisma/client';
import { netProfit } from './kpi';
import { buildTrialBalance, decodeCursor, encodeCursor, type TbAccount, type TbMovement } from './ledger';

const D = (v: string | number) => new Prisma.Decimal(v);
const acc = (
  id: string,
  code: string,
  type: TbAccount['type'],
  parentId: string | null,
  isPosting = true,
  reportingClass: string | null = null,
): TbAccount => ({
  id,
  code,
  name: id,
  nameAr: null,
  type,
  reportingClass,
  isPosting,
  parentId,
});
const mv = (opening: string, debit: string, credit: string): TbMovement => ({
  opening: D(opening),
  periodDebit: D(debit),
  periodCredit: D(credit),
});

const chart = [
  acc('assets', '1', 'asset', null, false),
  acc('bank', '1200', 'asset', 'assets'),
  acc('cash', '1100', 'asset', 'assets'),
  acc('idle', '1300', 'asset', 'assets'),
  acc('equity', '3000', 'equity', null),
  acc('sales', '4000', 'revenue', null),
  acc('parts', '5000', 'expense', null, true, 'cogs'),
  acc('rent', '6000', 'expense', null),
];

describe('buildTrialBalance', () => {
  // Opening: owner put 1000 in cash. Period: sales 500 to cash, parts 200 and rent 50 from bank,
  // 300 moved cash → bank.
  const movements = new Map<string, TbMovement>([
    ['cash', mv('1000', '500', '300')],
    ['bank', mv('0', '300', '250')],
    ['equity', mv('-1000', '0', '0')],
    ['sales', mv('0', '0', '500')],
    ['parts', mv('0', '200', '0')],
    ['rent', mv('0', '50', '0')],
  ]);

  it('orders by chart, rolls headers up from descendants and balances', () => {
    const tb = buildTrialBalance(chart, movements, false);
    expect(tb.rows.map((r) => [r.account.code, r.level])).toEqual([
      ['1', 0],
      ['1100', 1],
      ['1200', 1],
      ['3000', 0],
      ['4000', 0],
      ['5000', 0],
      ['6000', 0],
    ]);
    const assets = tb.rows[0]!;
    expect(assets.opening.toFixed(2)).toBe('1000.00');
    expect(assets.periodDebit.toFixed(2)).toBe('800.00');
    expect(assets.closing.toFixed(2)).toBe('1250.00');
    expect(tb.totals.periodDebit.toFixed(2)).toBe('1050.00');
    expect(tb.totals.periodCredit.toFixed(2)).toBe('1050.00');
    expect(tb.totals.closingDebit.toFixed(2)).toBe('1500.00'); // cash 1200 + bank 50 + parts 200 + rent 50
    expect(tb.totals.closingCredit.toFixed(2)).toBe('1500.00'); // equity 1000 + sales 500
    expect(tb.balanced).toBe(true);
    expect(netProfit(tb.result).toFixed(2)).toBe('250.00');
  });

  it('can include accounts without activity', () => {
    const tb = buildTrialBalance(chart, movements, true);
    expect(tb.rows.map((r) => r.account.code)).toContain('1300');
  });

  it('keeps a header whose children cancel out, with those children', () => {
    const m = new Map([
      ['cash', mv('100', '0', '0')],
      ['bank', mv('-100', '0', '0')],
    ]);
    const tb = buildTrialBalance(chart, m, false);
    expect(tb.rows.map((r) => r.account.code)).toEqual(['1', '1100', '1200']);
    expect(tb.rows[0]!.closing.isZero()).toBe(true);
  });

  it('reports an unbalanced ledger instead of hiding it', () => {
    const tb = buildTrialBalance(chart, new Map([['cash', mv('0', '10', '0')]]), false);
    expect(tb.balanced).toBe(false);
  });

  it('never counts a header’s own figure (headers cannot hold lines)', () => {
    const tb = buildTrialBalance(chart, new Map([['assets', mv('0', '999', '0')]]), false);
    expect(tb.rows).toEqual([]);
    expect(tb.totals.periodDebit.isZero()).toBe(true);
  });
});

describe('ledger cursor', () => {
  it('round-trips and rejects anything else', () => {
    const c = { date: '2026-11-03', number: 'JV-2026-000123', lineNo: 2 };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
    expect(decodeCursor('not-base64-json')).toBeNull();
    expect(decodeCursor(Buffer.from('["2026-11-03","x",0]').toString('base64url'))).toBeNull();
    expect(decodeCursor(Buffer.from('{"a":1}').toString('base64url'))).toBeNull();
  });
});
