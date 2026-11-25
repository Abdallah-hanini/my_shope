import { formatMoney, validateLines, Decimal } from './money';

describe('validateLines', () => {
  it('returns exact totals for balanced lines (no float error)', () => {
    const lines = [
      { debit: '0.10', credit: '0' },
      { debit: '0.20', credit: '0' },
      { debit: '0', credit: '0.30' },
    ];
    expect(validateLines(lines, 'QAR').total.toFixed(2)).toBe('0.30');
  });

  it('rejects unbalanced journals', () => {
    expect(() =>
      validateLines(
        [
          { debit: '100.00', credit: '0' },
          { debit: '0', credit: '99.99' },
        ],
        'QAR',
      ),
    ).toThrow(/not balanced/);
  });

  it('rejects lines with both or neither side', () => {
    expect(() =>
      validateLines(
        [
          { debit: '1', credit: '1' },
          { debit: '0', credit: '0' },
        ],
        'QAR',
      ),
    ).toThrow(/exactly one/);
    expect(() =>
      validateLines(
        [
          { debit: '0', credit: '0' },
          { debit: '0', credit: '0' },
        ],
        'QAR',
      ),
    ).toThrow(/exactly one/);
  });

  it('enforces currency minor units without rounding', () => {
    const three = [
      { debit: '1.125', credit: '0' },
      { debit: '0', credit: '1.125' },
    ];
    expect(() => validateLines(three, 'QAR')).toThrow(/at most 2 decimal places/);
    expect(validateLines(three, 'KWD').total.toFixed(3)).toBe('1.125');
  });

  it('accepts trailing zeros beyond the minor unit', () => {
    expect(
      validateLines(
        [
          { debit: '1.100000', credit: '0' },
          { debit: '0', credit: '1.10' },
        ],
        'QAR',
      ).total.toFixed(2),
    ).toBe('1.10');
  });

  it('formats with the currency scale', () => {
    expect(formatMoney(new Decimal('5'), 'BHD')).toBe('5.000');
  });
});
