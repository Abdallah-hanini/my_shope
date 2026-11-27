import { normalizeSearch } from './search-text';

describe('normalizeSearch', () => {
  it('ignores case and spacing', () => {
    expect(normalizeSearch('  Supplier   Bills ')).toBe('supplier bills');
  });
  it('folds Arabic letter variants and diacritics', () => {
    expect(normalizeSearch('إعدادات')).toBe(normalizeSearch('اعدادات'));
    expect(normalizeSearch('فاتورة')).toBe('فاتوره');
    expect(normalizeSearch('مُسْتَوْدَع')).toBe('مستودع');
    expect(normalizeSearch('مستشفى')).toBe('مستشفي');
  });
});
