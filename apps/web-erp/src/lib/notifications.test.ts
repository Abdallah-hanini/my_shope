import { fill, renderNotification } from './notifications';

describe('notification text', () => {
  it('fills placeholders and leaves unknown ones visible', () => {
    expect(fill('{a} and {b}', { a: 'x' })).toBe('x and {b}');
  });

  it('renders each kind in English and Arabic', () => {
    const n = {
      kind: 'journal_reversed',
      params: { actor: 'Owner', number: 'JV-1', reversalNumber: 'JV-2' },
    };
    expect(renderNotification(n, 'en')).toBe('Owner reversed journal JV-1 (reversal JV-2).');
    expect(renderNotification(n, 'ar')).toBe('عكس Owner القيد JV-1 (قيد العكس JV-2).');
    expect(
      renderNotification(
        {
          kind: 'role_granted',
          params: { role: 'Cashier', roleAr: 'أمين صندوق', branch: null, actor: 'Owner' },
        },
        'ar',
      ),
    ).toBe('منحك Owner الدور «أمين صندوق» (جميع الفروع).');
    expect(
      renderNotification(
        { kind: 'export_ready', params: { exportKind: 'trial_balance', fileName: 'tb.xlsx' } },
        'en',
      ),
    ).toBe('Your export “Trial balance” is ready to download (tb.xlsx).');
  });

  it('uses neutral wording when the event lacks a name (older events, deleted roles)', () => {
    expect(renderNotification({ kind: 'role_revoked', params: { role: null, actor: null } }, 'en')).toBe(
      'Someone removed one of your roles.',
    );
  });
});
