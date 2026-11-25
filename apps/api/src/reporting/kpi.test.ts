import { Prisma } from '@prisma/client';
import { grossMarginPercent, grossProfit, lastDayOfMonth, monthRange, netProfit } from './kpi';

const D = (v: string) => new Prisma.Decimal(v);

describe('KPI formulas', () => {
  const sums = { revenue: D('425000.00'), cogs: D('277000.00'), operatingExpenses: D('55500.00') };

  it('gross and net profit', () => {
    expect(grossProfit(sums).toFixed(2)).toBe('148000.00');
    expect(netProfit(sums).toFixed(2)).toBe('92500.00');
  });

  it('gross margin with one decimal, half-up', () => {
    expect(grossMarginPercent(sums)).toBe('34.8');
    expect(grossMarginPercent({ revenue: D('3'), cogs: D('1'), operatingExpenses: D('0') })).toBe('66.7');
  });

  it('gross margin is null, not 0, when there is no revenue', () => {
    expect(grossMarginPercent({ revenue: D('0'), cogs: D('10'), operatingExpenses: D('0') })).toBeNull();
  });

  it('handles negative margins (cogs above revenue)', () => {
    expect(grossMarginPercent({ revenue: D('100'), cogs: D('150'), operatingExpenses: D('0') })).toBe(
      '-50.0',
    );
  });

  it('month helpers cover year boundaries and leap years', () => {
    expect(monthRange('2025-11', '2026-02')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    expect(lastDayOfMonth('2028-02')).toBe('2028-02-29');
    expect(lastDayOfMonth('2026-02')).toBe('2026-02-28');
    expect(lastDayOfMonth('2026-12')).toBe('2026-12-31');
  });
});
