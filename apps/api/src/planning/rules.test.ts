import { Prisma } from '@prisma/client';
import { daysInMonth, expectedByNow, stockPosition } from './rules';

const d = (v: string | number) => new Prisma.Decimal(v);

describe('stockPosition', () => {
  it('ok above the reorder point; low at or below it; out at zero or below', () => {
    expect(stockPosition(d(10), d(0), d(5), d(12)).status).toBe('ok');
    expect(stockPosition(d(5), d(0), d(5), d(12)).status).toBe('low');
    expect(stockPosition(d(6), d(1), d(5), d(12)).status).toBe('low'); // reserved counts
    expect(stockPosition(d(2), d(2), d(5), d(12)).status).toBe('out');
    expect(stockPosition(d(0), d(0), d(0), d(1)).status).toBe('out');
  });
  it('suggests the reorder quantity, or the gap to the minimum when that is larger', () => {
    expect(stockPosition(d(4), d(0), d(5), d(12)).suggested.toFixed(3)).toBe('12.000');
    expect(stockPosition(d(1), d(0), d(20), d(6)).suggested.toFixed(3)).toBe('19.000');
    expect(stockPosition(d(10), d(0), d(5), d(12)).suggested.toFixed(3)).toBe('0.000');
    expect(stockPosition(d('2.5'), d(0), d('4.25'), d(1)).available.toFixed(3)).toBe('2.500');
  });
});

describe('target pace', () => {
  it('days in month handles leap years', () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 11)).toBe(30);
  });
  it('expected by now is the even share of the target, rounded half up', () => {
    expect(expectedByNow(d(3000), 10, 30).toFixed(2)).toBe('1000.00');
    expect(expectedByNow(d(1000), 1, 3).toFixed(2)).toBe('333.33');
    expect(expectedByNow(d('100.01'), 1, 2).toFixed(2)).toBe('50.01');
  });
});
