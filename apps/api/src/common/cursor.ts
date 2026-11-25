import { badRequest } from './errors';

export interface Cursor {
  at: string;
  id: string;
}

/** Opaque keyset cursor over (timestamp DESC, id DESC). */
export function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify([c.at, c.id])).toString('base64url');
}

export function decodeCursor(raw: string | undefined): Cursor | undefined {
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (
      Array.isArray(parsed) &&
      parsed.length === 2 &&
      typeof parsed[0] === 'string' &&
      typeof parsed[1] === 'string' &&
      !Number.isNaN(Date.parse(parsed[0])) &&
      /^[0-9a-f-]{36}$/i.test(parsed[1])
    ) {
      return { at: parsed[0], id: parsed[1] };
    }
  } catch {
    // fall through to the explicit error below
  }
  throw badRequest('cursor is malformed');
}
