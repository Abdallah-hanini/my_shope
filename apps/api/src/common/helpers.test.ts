import { canonicalJson, requestHash } from './canonical-hash';
import { decodeCursor, encodeCursor } from './cursor';
import { fromIsoDate, toIsoDate } from './dates';

describe('canonical hashing', () => {
  it('ignores key order and undefined values', () => {
    expect(canonicalJson({ b: 1, a: [{ y: 2, x: undefined, w: null }] })).toBe(
      '{"a":[{"w":null,"y":2}],"b":1}',
    );
    expect(requestHash({ a: 1, b: 2 })).toBe(requestHash({ b: 2, a: 1 }));
  });

  it('distinguishes different payloads', () => {
    expect(requestHash({ amount: '10.00' })).not.toBe(requestHash({ amount: '10.01' }));
  });
});

describe('cursor', () => {
  it('round-trips', () => {
    const c = { at: '2026-01-01T00:00:00.000Z', id: '7d0c3f0e-5f8a-4a43-9a6e-4c1b2c3d4e5f' };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
  });

  it('treats a missing cursor as the first page', () => {
    expect(decodeCursor(undefined)).toBeUndefined();
  });

  it.each([
    'garbage',
    Buffer.from('["x","y"]').toString('base64url'),
    Buffer.from('{}').toString('base64url'),
  ])('rejects malformed cursor %p with 400', (raw) => {
    expect(() => decodeCursor(raw)).toThrow(/cursor is malformed/);
  });
});

describe('business dates', () => {
  it('round-trips without time-zone drift', () => {
    expect(toIsoDate(fromIsoDate('2026-03-31'))).toBe('2026-03-31');
  });
});
