import { chunk, deriveKey, safeReturnTo, seal, unchunk, unseal } from './session-crypto';

const secret = 'x'.repeat(43);
const now = () => Math.floor(Date.now() / 1000);

describe('session sealing', () => {
  it('round-trips a payload', async () => {
    const key = deriveKey(secret, 'session');
    const token = await seal({ sub: 'u1', accessToken: 'at' }, key, now() + 60);
    expect(await unseal<{ sub: string }>(token, key)).toMatchObject({ sub: 'u1', accessToken: 'at' });
    expect(token).not.toContain('u1');
  });

  it('rejects tampering, wrong key, wrong purpose and expiry', async () => {
    const key = deriveKey(secret, 'session');
    const token = await seal({ sub: 'u1' }, key, now() + 60);
    const tampered = token.slice(0, -4) + (token.endsWith('AAAA') ? 'BBBB' : 'AAAA');
    expect(await unseal(tampered, key)).toBeNull();
    expect(await unseal(token, deriveKey('y'.repeat(43), 'session'))).toBeNull();
    expect(await unseal(token, deriveKey(secret, 'login'))).toBeNull();
    expect(await unseal(await seal({ sub: 'u1' }, key, now() - 5), key)).toBeNull();
    expect(await unseal(undefined, key)).toBeNull();
    expect(await unseal('not-a-jwe', key)).toBeNull();
  });

  it('refuses a short secret', () => {
    expect(() => deriveKey('short', 'session')).toThrow(/32 characters/);
  });
});

describe('cookie chunking', () => {
  it('splits and rejoins in order', () => {
    const value = 'a'.repeat(9000);
    const parts = chunk(value);
    expect(parts.map((p) => p.length)).toEqual([3800, 3800, 1400]);
    const jar = Object.fromEntries(parts.map((p, i) => [`s.${i}`, p]));
    expect(unchunk('s', (n) => jar[n])).toBe(value);
  });

  it('returns undefined when nothing is stored', () => {
    expect(unchunk('s', () => undefined)).toBeUndefined();
  });
});

describe('safeReturnTo (no open redirect)', () => {
  it.each([
    ['/en/c/123/journals?cursor=abc', '/en/c/123/journals?cursor=abc'],
    ['/ar', '/ar'],
    [undefined, '/'],
    ['', '/'],
    ['https://evil.test/', '/'],
    ['//evil.test/x', '/'],
    ['/\\evil.test', '/'],
    ['javascript:alert(1)', '/'],
    ['/%0d%0aSet-Cookie:x', '/%0d%0aSet-Cookie:x'],
    ['/ok\nbad', '/'],
  ])('%p -> %p', (raw, expected) => {
    expect(safeReturnTo(raw as string | undefined)).toBe(expected);
  });
});
