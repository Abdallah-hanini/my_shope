import { redact } from './audit';

describe('audit redaction', () => {
  it('masks sensitive keys at any depth and keeps the rest', () => {
    expect(
      redact({
        email: 'a@b.test',
        accessToken: 'x',
        nested: { password: 'p', amount: '10.00' },
        list: [{ cardNumber: '4111' }],
      }),
    ).toEqual({
      email: 'a@b.test',
      accessToken: '[redacted]',
      nested: { password: '[redacted]', amount: '10.00' },
      list: [{ cardNumber: '[redacted]' }],
    });
  });
});
