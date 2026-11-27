import { Prisma } from '@prisma/client';
import { changePercent, daysBetween, payableBucket, previousPeriod, receivableBucket } from './aging';

const D = (v: string) => new Prisma.Decimal(v);

describe('aging', () => {
  it('counts whole calendar days, across month and year ends', () => {
    expect(daysBetween('2026-11-30', '2026-12-01')).toBe(1);
    expect(daysBetween('2025-12-31', '2026-03-01')).toBe(60);
    expect(daysBetween('2026-03-10', '2026-03-10')).toBe(0);
  });
  it('receivable buckets by age, boundaries inclusive', () => {
    expect([0, 30, 31, 60, 61, 90, 91].map(receivableBucket)).toEqual([
      'd0_30',
      'd0_30',
      'd31_60',
      'd31_60',
      'd61_90',
      'd61_90',
      'd90plus',
    ]);
  });
  it('payable buckets by days past due; not yet due is current', () => {
    expect([-5, 0, 1, 30, 31, 60, 61, 90, 91].map(payableBucket)).toEqual([
      'current',
      'current',
      'd1_30',
      'd1_30',
      'd31_60',
      'd31_60',
      'd61_90',
      'd61_90',
      'd90plus',
    ]);
  });
  it('previous period has the same length and ends the day before', () => {
    expect(previousPeriod('2026-11-01', '2026-11-30')).toEqual({ from: '2026-10-02', to: '2026-10-31' });
    expect(previousPeriod('2026-01-01', '2026-01-01')).toEqual({ from: '2025-12-31', to: '2025-12-31' });
  });
  it('change percent is null on a zero base and signed otherwise', () => {
    expect(changePercent(D('150'), D('100'))).toBe('50.0');
    expect(changePercent(D('-50'), D('-100'))).toBe('50.0');
    expect(changePercent(D('10'), D('0'))).toBeNull();
  });
});
