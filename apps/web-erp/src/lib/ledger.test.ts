import { drCr, ledgerRange, query } from './ledger';

describe('ledger helpers', () => {
  it('splits signed balances into amount and side', () => {
    expect(drCr('1250.00')).toEqual({ amount: '1250.00', side: 'dr' });
    expect(drCr('-50000.000')).toEqual({ amount: '50000.000', side: 'cr' });
    expect(drCr('0.00')).toEqual({ amount: '0.00', side: null });
    expect(drCr('-0.00')).toEqual({ amount: '0.00', side: null });
  });

  it('falls back to this month for anything that is not a date', () => {
    const r = ledgerRange('Asia/Qatar', { from: '2026-01-01', to: 'x' });
    expect(r.from).toBe('2026-01-01');
    expect(r.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(ledgerRange('Asia/Qatar', {}).from).toMatch(/^\d{4}-\d{2}-01$/);
  });

  it('builds query strings without empty values', () => {
    expect(query({ from: '2026-01-01', branch: undefined, zero: false })).toBe('?from=2026-01-01');
    expect(query({})).toBe('');
  });
});
