import { Prisma } from '@prisma/client';
import { averageCost, stockIn, stockOut } from './stock-math';

const d = (v: string) => new Prisma.Decimal(v);
const lvl = (onHand: string, value: string) => ({ onHand: d(onHand), value: d(value) });
const show = (c: ReturnType<typeof stockIn>) => [
  c.movementValue.toFixed(2),
  c.after.onHand.toFixed(3),
  c.after.value.toFixed(2),
];

describe('weighted average stock', () => {
  it('receipts add quantity × cost and move the average', () => {
    const a = stockIn(lvl('0', '0'), d('10'), d('12.50'));
    expect(show(a)).toEqual(['125.00', '10.000', '125.00']);
    const b = stockIn(a.after, d('5'), d('14'));
    expect(show(b)).toEqual(['70.00', '15.000', '195.00']);
    expect(averageCost(b.after)?.toFixed(4)).toBe('13.0000');
  });

  it('stock out at the average, half up; the last units take the rest; never negative', () => {
    const level = lvl('3', '10.00'); // average 3.3333…
    const one = stockOut(level, d('1'));
    expect(show(one)).toEqual(['3.33', '2.000', '6.67']);
    const rest = stockOut(one.after, d('2'));
    expect(show(rest)).toEqual(['6.67', '0.000', '0.00']);
    expect(() => stockOut(lvl('1.5', '9'), d('2'))).toThrow(RangeError);
    expect(averageCost(lvl('0', '0'))).toBeNull();
  });

  it('fractional quantities (litres)', () => {
    expect(show(stockIn(lvl('0', '0'), d('4.5'), d('8.2')))).toEqual(['36.90', '4.500', '36.90']);
    expect(show(stockOut(lvl('4.5', '36.90'), d('0.75')))).toEqual(['6.15', '3.750', '30.75']);
  });
});
