import { Prisma } from '@prisma/client';
import { quoteTotals } from './quote-math';

const d = (v: string) => new Prisma.Decimal(v);
const line = (hours: string, rate: string, override: string | null = null) => ({
  hours: d(hours),
  rate: d(rate),
  override: override === null ? null : d(override),
});
const s = (t: ReturnType<typeof quoteTotals>) => ({
  lines: t.lines.map((x) => x.toFixed(2)),
  subtotal: t.subtotal.toFixed(2),
  discount: t.discount.toFixed(2),
  net: t.net.toFixed(2),
  tax: t.tax.toFixed(2),
  total: t.total.toFixed(2),
});

describe('quote totals', () => {
  it('hours × rate per line, overrides win, no tax without a tax code', () => {
    expect(
      s(quoteTotals([line('1.5', '150'), line('0.33', '150'), line('2', '150', '250')], d('0'), null, false)),
    ).toEqual({
      lines: ['225.00', '49.50', '250.00'],
      subtotal: '524.50',
      discount: '0.00',
      net: '524.50',
      tax: '0.00',
      total: '524.50',
    });
  });

  it('discount then tax added (prices exclude tax), each rounded half up', () => {
    expect(s(quoteTotals([line('1', '100.05')], d('10'), d('5'), false))).toEqual({
      lines: ['100.05'],
      subtotal: '100.05',
      discount: '10.01',
      net: '90.04',
      tax: '4.50',
      total: '94.54',
    });
  });

  it('tax extracted when prices include it; the total is the net price', () => {
    expect(s(quoteTotals([line('1', '105')], d('0'), d('5'), true))).toMatchObject({
      tax: '5.00',
      total: '105.00',
      net: '105.00',
    });
    expect(s(quoteTotals([line('1', '100')], d('0'), d('15'), true))).toMatchObject({
      tax: '13.04',
      total: '100.00',
    });
    expect(s(quoteTotals([line('1', '100')], d('0'), d('0'), true))).toMatchObject({
      tax: '0.00',
      total: '100.00',
    });
  });
});
