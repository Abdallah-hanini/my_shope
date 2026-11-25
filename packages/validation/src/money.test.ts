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
