import { Prisma } from '@prisma/client';
import { balanceOf, invoiceLines, paymentLines, reversedLines } from './billing-math';

const d = (v: string) => new Prisma.Decimal(v);
const show = (ls: ReturnType<typeof invoiceLines>) =>
  ls.map((l) => [l.accountId, l.debit.toFixed(2), l.credit.toFixed(2)]);
const acc = { receivable: 'AR', revenue: 'REV', tax: 'TAX' };

describe('billing journals', () => {
  it('invoice: receivable = revenue + tax, balanced', () => {
    const ls = invoiceLines({ total: d('274.31'), tax: d('13.06') }, acc, 'INV');
    expect(show(ls)).toEqual([
      ['AR', '274.31', '0.00'],
      ['REV', '0.00', '261.25'],
      ['TAX', '0.00', '13.06'],
    ]);
    const dr = ls.reduce((s, l) => s.plus(l.debit), d('0'));
    const cr = ls.reduce((s, l) => s.plus(l.credit), d('0'));
    expect(dr.equals(cr)).toBe(true);
  });

  it('no tax: two lines; tax without an account is refused', () => {
    expect(show(invoiceLines({ total: d('403.75'), tax: d('0') }, { ...acc, tax: null }, 'INV'))).toEqual([
      ['AR', '403.75', '0.00'],
      ['REV', '0.00', '403.75'],
    ]);
    expect(() => invoiceLines({ total: d('105'), tax: d('5') }, { ...acc, tax: null }, 'INV')).toThrow();
  });

  it('payment and credit note mirror the receivable; balance after payments', () => {
    expect(show(paymentLines(d('100'), { money: 'CASH', receivable: 'AR' }, 'RC'))).toEqual([
      ['CASH', '100.00', '0.00'],
      ['AR', '0.00', '100.00'],
    ]);
    expect(show(reversedLines(invoiceLines({ total: d('105'), tax: d('5') }, acc, 'INV'), 'CN'))).toEqual([
      ['AR', '0.00', '105.00'],
      ['REV', '100.00', '0.00'],
      ['TAX', '5.00', '0.00'],
    ]);
    expect(balanceOf(d('274.31'), [d('100'), d('74.31')]).toFixed(2)).toBe('100.00');
  });
});
