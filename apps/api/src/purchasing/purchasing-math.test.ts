import { Prisma } from '@prisma/client';
import { billJournalLines, billTotals, dueDate, supplierPaymentLines } from './purchasing-math';

const D = (v: string) => new Prisma.Decimal(v);
const acc = { goodsReceived: 'grni', payables: 'ap', inputTax: 'vat-in', priceVariance: 'ppv' };
const show = (l: ReturnType<typeof billJournalLines>) =>
  l.map((x) => [x.accountId, x.debit.toFixed(2), x.credit.toFixed(2)]);

describe('supplier bill totals', () => {
  it('adds lines, takes the difference and tax half up on the billed amount', () => {
    const t = billTotals(
      [
        { receiptValue: D('91.00'), amount: D('91.00') },
        { receiptValue: D('50.00'), amount: D('52.35') },
      ],
      D('5'),
    );
    expect(
      [t.receiptsValue, t.netAmount, t.varianceAmount, t.taxAmount, t.total].map((x) => x.toFixed(2)),
    ).toEqual(['141.00', '143.35', '2.35', '7.17', '150.52']);
  });
  it('no tax code means no tax', () => {
    expect(billTotals([{ receiptValue: D('10'), amount: D('9.5') }], null).taxAmount.toFixed(2)).toBe('0.00');
  });
});

describe('bill journal', () => {
  it('balances with a higher bill (variance debit)', () => {
    const t = billTotals([{ receiptValue: D('100'), amount: D('104') }], D('5'));
    const l = billJournalLines(t, acc, 'PB');
    expect(show(l)).toEqual([
      ['grni', '100.00', '0.00'],
      ['ppv', '4.00', '0.00'],
      ['vat-in', '5.20', '0.00'],
      ['ap', '0.00', '109.20'],
    ]);
  });
  it('balances with a lower bill (variance credit) and needs the accounts', () => {
    const t = billTotals([{ receiptValue: D('100'), amount: D('97.50') }], null);
    const l = billJournalLines(t, acc, 'PB');
    expect(show(l)).toEqual([
      ['grni', '100.00', '0.00'],
      ['ppv', '0.00', '2.50'],
      ['ap', '0.00', '97.50'],
    ]);
    const sum = (k: 'debit' | 'credit') => l.reduce((s, x) => s.plus(x[k]), D('0')).toFixed(2);
    expect(sum('debit')).toBe(sum('credit'));
    expect(() => billJournalLines(t, { ...acc, priceVariance: null }, 'PB')).toThrow();
  });
  it('payments settle the payable; due dates add the terms', () => {
    expect(show(supplierPaymentLines(D('20'), { payables: 'ap', money: 'bank' }, 'PV'))).toEqual([
      ['ap', '20.00', '0.00'],
      ['bank', '0.00', '20.00'],
    ]);
    expect(dueDate('2026-11-20', 30)).toBe('2026-12-20');
    expect(dueDate('2026-12-31', 0)).toBe('2026-12-31');
  });
});
