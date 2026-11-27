import { Prisma } from '@prisma/client';
import { classifyStock, percent } from './analytics.service';

const D = (v: string) => new Prisma.Decimal(v);

describe('analytics rules', () => {
  it('percent: one decimal half up; null on a zero denominator', () => {
    expect(percent(1, 3)).toBe('33.3');
    expect(percent(2, 3)).toBe('66.7');
    expect(percent(D('5'), D('0'))).toBeNull();
  });
  it('fast parts make up the first 80 % of issued value (the crossing part included); then slow; stock without issue is dead', () => {
    const c = classifyStock([
      { key: 'A', issuedValue: D('500'), closingQty: D('1') }, // 0 → 50 %: fast
      { key: 'B', issuedValue: D('300'), closingQty: D('0') }, // 50 → 80 %: fast (starts below 80 %)
      { key: 'C', issuedValue: D('150'), closingQty: D('4') }, // starts at 80 %: slow
      { key: 'D', issuedValue: D('50'), closingQty: D('2') }, // slow
      { key: 'E', issuedValue: D('0'), closingQty: D('7') }, // no issue, in stock: dead
      { key: 'F', issuedValue: D('0'), closingQty: D('0') }, // nothing: none
    ]);
    expect(Object.fromEntries(c)).toEqual({
      A: 'fast',
      B: 'fast',
      C: 'slow',
      D: 'slow',
      E: 'dead',
      F: 'none',
    });
  });
});
