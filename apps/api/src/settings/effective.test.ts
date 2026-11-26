import { effectiveOn } from './effective';

describe('dated rates', () => {
  const rows = [
    { effectiveFrom: '2027-01-01', rate: '5' },
    { effectiveFrom: '2026-01-01', rate: '0' },
    { effectiveFrom: '2027-07-01', rate: '10' },
  ];
  it('picks the latest rate that has started', () => {
    expect(effectiveOn(rows, '2025-12-31')).toBeNull();
    expect(effectiveOn(rows, '2026-01-01')?.rate).toBe('0');
    expect(effectiveOn(rows, '2026-12-31')?.rate).toBe('0');
    expect(effectiveOn(rows, '2027-01-01')?.rate).toBe('5');
    expect(effectiveOn(rows, '2030-01-01')?.rate).toBe('10');
    expect(effectiveOn([], '2030-01-01')).toBeNull();
  });
});
