import { decimalPlaces, isPositiveMoney, isSupportedCurrency, minorUnits, moneyString } from './money';
import { postJournalSchema, createFiscalPeriodSchema, createCompanySchema } from './requests';

describe('money', () => {
  it.each(['0', '1', '10.5', '125.50', '99999999999999.999999'])('accepts %p', (v) => {
    expect(moneyString.safeParse(v).success).toBe(true);
  });

  it.each(['-1', '1e3', '01', '1.', '.5', '1.1234567', '100000000000000', ' 1', '1,000.00', 'NaN'])(
    'rejects %p',
    (v) => {
      expect(moneyString.safeParse(v).success).toBe(false);
    },
  );

  it('rejects JSON numbers for money', () => {
    expect(moneyString.safeParse(12.5).success).toBe(false);
  });

  it('counts decimal places without float conversion', () => {
    expect(decimalPlaces('10')).toBe(0);
    expect(decimalPlaces('10.50')).toBe(2);
    expect(decimalPlaces('0.125')).toBe(3);
  });

  it('detects positive amounts', () => {
    expect(isPositiveMoney('0')).toBe(false);
    expect(isPositiveMoney('0.000')).toBe(false);
    expect(isPositiveMoney('0.01')).toBe(true);
  });

  it('knows minor units and rejects unknown currencies', () => {
    expect(minorUnits('QAR')).toBe(2);
    expect(minorUnits('KWD')).toBe(3);
    expect(isSupportedCurrency('XYZ')).toBe(false);
    expect(() => minorUnits('XYZ')).toThrow();
  });
});

describe('request schemas', () => {
  const line = { accountId: '7d0c3f0e-5f8a-4a43-9a6e-4c1b2c3d4e5f', debit: '10.00' };

  it('requires at least two journal lines', () => {
    expect(
      postJournalSchema.safeParse({ postingDate: '2026-01-31', description: 'x', lines: [line] }).success,
    ).toBe(false);
  });

  it('rejects impossible calendar dates', () => {
    expect(
      postJournalSchema.safeParse({ postingDate: '2026-02-30', description: 'x', lines: [line, line] })
        .success,
    ).toBe(false);
  });

  it('rejects a period ending before it starts', () => {
    const r = createFiscalPeriodSchema.safeParse({
      name: 'P',
      startDate: '2026-02-01',
      endDate: '2026-01-31',
    });
    expect(r.success).toBe(false);
  });

  it('validates company currency and time zone', () => {
    const base = { code: 'ACME', legalName: 'Acme', initialAdminUserId: line.accountId };
    expect(
      createCompanySchema.safeParse({ ...base, baseCurrency: 'QAR', timezone: 'Asia/Qatar' }).success,
    ).toBe(true);
    expect(
      createCompanySchema.safeParse({ ...base, baseCurrency: 'XYZ', timezone: 'Asia/Qatar' }).success,
    ).toBe(false);
    expect(
      createCompanySchema.safeParse({ ...base, baseCurrency: 'QAR', timezone: 'Mars/Base' }).success,
    ).toBe(false);
  });
});

describe('minor units', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { toMinorUnits, formatMinorUnits } = require('./money') as typeof import('./money');

  it.each([
    ['0', 2, 0n],
    ['125.5', 2, 12550n],
    ['125.50', 2, 12550n],
    ['0.10', 2, 10n],
    ['1.125', 3, 1125n],
    ['99999999999999.990000', 2, 9999999999999999n],
    ['7', 0, 7n],
  ])('%s at scale %d → %s', (v, scale, expected) => {
    expect(toMinorUnits(v as string, scale as number)).toBe(expected);
  });

  it('adds without float error (0.1 + 0.2 = 0.30)', () => {
    expect(formatMinorUnits(toMinorUnits('0.1', 2) + toMinorUnits('0.2', 2), 2)).toBe('0.30');
  });

  it('rejects significant digits beyond the scale and malformed input', () => {
    expect(() => toMinorUnits('1.005', 2)).toThrow(/more than 2/);
    expect(() => toMinorUnits('-1', 2)).toThrow(/invalid/);
    expect(() => toMinorUnits('1e3', 2)).toThrow(/invalid/);
  });

  it('formats negatives and zero scale', () => {
    expect(formatMinorUnits(-1250n, 2)).toBe('-12.50');
    expect(formatMinorUnits(5n, 0)).toBe('5');
    expect(formatMinorUnits(5n, 3)).toBe('0.005');
  });
});

describe('reporting schemas', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const r = require('./requests') as typeof import('./requests');
  const acct = { code: '1100', name: 'Cash', type: 'asset', isPosting: true };

  it('accepts a matching reporting class and rejects mismatches', () => {
    expect(r.createAccountSchema.safeParse({ ...acct, reportingClass: 'cash' }).success).toBe(true);
    expect(r.createAccountSchema.safeParse({ ...acct, reportingClass: 'cogs' }).success).toBe(false);
    expect(
      r.createAccountSchema.safeParse({ ...acct, isPosting: false, reportingClass: 'cash' }).success,
    ).toBe(false);
    expect(
      r.createAccountSchema.safeParse({ ...acct, type: 'expense', reportingClass: 'cogs' }).success,
    ).toBe(true);
  });

  it('validates the financial summary range', () => {
    expect(r.financialSummaryQuerySchema.safeParse({ from: '2026-01', to: '2026-12' }).success).toBe(true);
    expect(r.financialSummaryQuerySchema.safeParse({ from: '2026-12', to: '2026-01' }).success).toBe(false);
    expect(r.financialSummaryQuerySchema.safeParse({ from: '2024-01', to: '2026-01' }).success).toBe(false);
    expect(r.financialSummaryQuerySchema.safeParse({ from: '2026-13', to: '2026-13' }).success).toBe(false);
    expect(r.monthsBetween('2025-11', '2026-02')).toBe(4);
  });
});
