import {
  recordPaymentSchema,
  updateQuoteSchema,
  addTaxRateSchema,
  companyProfileSchema,
  createTaxCodeSchema,
  moneySchema,
  percentSchema,
} from './settings';

describe('tax and pricing settings', () => {
  it('percentages: 0–100 with up to 4 decimals', () => {
    for (const ok of ['0', '5', '15.5', '100', '2.1234'])
      expect(percentSchema.safeParse(ok).success).toBe(true);
    for (const bad of ['-1', '100.01', '5%', '1.23456', ''])
      expect(percentSchema.safeParse(bad).success).toBe(false);
  });
  it('money: positive with up to 2 decimals', () => {
    expect(moneySchema.safeParse('150').success).toBe(true);
    expect(moneySchema.safeParse('150.50').success).toBe(true);
    expect(moneySchema.safeParse('0').success).toBe(false);
    expect(moneySchema.safeParse('1.005').success).toBe(false);
  });
  it('tax codes are short upper-case codes; rates need a date', () => {
    expect(createTaxCodeSchema.parse({ code: ' vat-std ', name: 'VAT standard' }).code).toBe('VAT-STD');
    expect(createTaxCodeSchema.safeParse({ code: 'VAT 5', name: 'x' }).success).toBe(false);
    expect(addTaxRateSchema.safeParse({ rate: '5', effectiveFrom: '2027-01-01' }).success).toBe(true);
    expect(addTaxRateSchema.safeParse({ rate: '5' }).success).toBe(false);
  });
  it('the letterhead fields are optional; empty becomes null', () => {
    expect(companyProfileSchema.parse({ version: 1, crNumber: '', phone: '', address: ' ' })).toMatchObject({
      crNumber: null,
      phone: null,
      address: null,
    });
    expect(companyProfileSchema.safeParse({ version: 1, phone: 'call us' }).success).toBe(false);
  });
});

describe('quote changes', () => {
  const u = '00000000-0000-4000-8000-000000000001';
  it('a discount or a changed price needs a reason', () => {
    const ok = updateQuoteSchema.safeParse({ version: 1, discountPct: '0', lines: [] });
    expect(ok.success).toBe(true);
    expect(updateQuoteSchema.safeParse({ version: 1, discountPct: '5', lines: [] }).success).toBe(false);
    expect(
      updateQuoteSchema.safeParse({
        version: 1,
        discountPct: '5',
        discountReason: 'Loyal customer',
        lines: [],
      }).success,
    ).toBe(true);
    expect(
      updateQuoteSchema.safeParse({
        version: 1,
        discountPct: '0',
        lines: [{ taskId: u, overrideAmount: '100', overrideReason: '' }],
      }).success,
    ).toBe(false);
    expect(
      updateQuoteSchema.safeParse({
        version: 1,
        discountPct: '0',
        lines: [{ taskId: u, overrideAmount: '100', overrideReason: 'Fixed price' }],
      }).success,
    ).toBe(true);
  });
});

describe('payments', () => {
  const key = '00000000-0000-4000-8000-000000000009';
  it('card and bank payments need a reference; amounts are positive with 2 decimals', () => {
    expect(
      recordPaymentSchema.safeParse({ method: 'cash', amount: '100', idempotencyKey: key }).success,
    ).toBe(true);
    expect(
      recordPaymentSchema.safeParse({ method: 'card', amount: '100', idempotencyKey: key }).success,
    ).toBe(false);
    expect(
      recordPaymentSchema.safeParse({
        method: 'bank',
        amount: '100',
        reference: 'TRX-1',
        idempotencyKey: key,
      }).success,
    ).toBe(true);
    expect(recordPaymentSchema.safeParse({ method: 'cash', amount: '0', idempotencyKey: key }).success).toBe(
      false,
    );
    expect(
      recordPaymentSchema.safeParse({ method: 'cheque', amount: '1', idempotencyKey: key }).success,
    ).toBe(false);
  });
});
