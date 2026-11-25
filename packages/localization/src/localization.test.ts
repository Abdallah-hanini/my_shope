import { ar } from './messages/ar';
import { en } from './messages/en';
import { createTranslator, formatDateTime, getDirection, groupDigits, resolveLocale } from './index';

describe('localization', () => {
  it('Arabic and English catalogs define exactly the same keys', () => {
    expect(Object.keys(ar).sort()).toEqual(Object.keys(en).sort());
  });

  it('has no empty translations', () => {
    for (const [k, v] of [...Object.entries(en), ...Object.entries(ar)]) {
      expect(v.trim()).not.toBe('');
      expect(k).toBeTruthy();
    }
  });

  it('maps Arabic to RTL and English to LTR', () => {
    expect(getDirection('ar')).toBe('rtl');
    expect(getDirection('en')).toBe('ltr');
  });

  it.each([
    ['ar-QA', 'ar'],
    ['AR', 'ar'],
    ['en_US', 'en'],
    ['fr-FR', 'en'],
    [undefined, 'en'],
    ['', 'en'],
  ])('resolves %p to %p', (tag, expected) => {
    expect(resolveLocale(tag)).toBe(expected);
  });

  it('translates per locale', () => {
    expect(createTranslator('en')('health.title')).toBe('System status');
    expect(createTranslator('ar')('health.title')).toBe('حالة النظام');
  });

  it('formats a UTC timestamp in an explicit time zone', () => {
    const s = formatDateTime('en', '2026-01-01T21:30:00Z', 'Asia/Qatar');
    expect(s).toMatch(/2 Jan 2026/);
    expect(s).toMatch(/00:30:00/);
  });
});

describe('groupDigits', () => {
  it.each([
    ['50000.00', '50,000.00'],
    ['0.00', '0.00'],
    ['999.99', '999.99'],
    ['1000', '1,000'],
    ['-2000.00', '-2,000.00'],
    ['12345678901234.567890', '12,345,678,901,234.567890'],
    ['not money', 'not money'],
  ])('%s → %s', (input, expected) => {
    expect(groupDigits(input)).toBe(expected);
  });
});
