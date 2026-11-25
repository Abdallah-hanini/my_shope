import { hkdfSync } from 'node:crypto';
import { EncryptJWT, jwtDecrypt } from 'jose';

/**
 * Pure (framework-free) session sealing so it can be unit-tested. Sessions are encrypted and
 * authenticated with AES-256-GCM (JWE "dir"); the key is derived from WEB_SESSION_SECRET with
 * HKDF and a purpose label, so the same secret can never decrypt another kind of cookie.
 */
export interface SessionData {
  /** OIDC subject (Keycloak user id). */
  sub: string;
  accessToken: string;
  /** Epoch seconds. */
  accessTokenExpiresAt: number;
  refreshToken: string;
  /** Epoch seconds; the session ends here at the latest. */
  refreshTokenExpiresAt: number;
  idToken: string;
}

export interface LoginState {
  codeVerifier: string;
  state: string;
  nonce: string;
  returnTo: string;
}

const enc = 'A256GCM';

export function deriveKey(secret: string, purpose: 'session' | 'login'): Uint8Array {
  if (secret.length < 32) throw new Error('session secret must be at least 32 characters');
  return new Uint8Array(hkdfSync('sha256', secret, 'erp-web', `erp-web ${purpose} v1`, 32));
}

export async function seal(payload: object, key: Uint8Array, expiresAt: number): Promise<string> {
  return new EncryptJWT({ ...payload })
    .setProtectedHeader({ alg: 'dir', enc })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .encrypt(key);
}

/** Returns null for anything that does not decrypt, is expired or is malformed. */
export async function unseal<T>(token: string | undefined, key: Uint8Array): Promise<T | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtDecrypt(token, key, {
      keyManagementAlgorithms: ['dir'],
      contentEncryptionAlgorithms: [enc],
    });
    return payload as T;
  } catch {
    return null;
  }
}

/** Browsers cap a cookie near 4 KB; sealed tokens are split across numbered cookies. */
export const CHUNK_SIZE = 3800;

export function chunk(value: string, size = CHUNK_SIZE): string[] {
  const parts: string[] = [];
  for (let i = 0; i < value.length; i += size) parts.push(value.slice(i, i + size));
  return parts;
}

/** Joins chunks named `${name}.0`, `${name}.1`, … in order; stops at the first gap. */
export function unchunk(name: string, get: (cookieName: string) => string | undefined): string | undefined {
  let out = '';
  for (let i = 0; ; i++) {
    const part = get(`${name}.${i}`);
    if (part === undefined) break;
    out += part;
  }
  return out || undefined;
}

/**
 * Only same-site relative paths are accepted as post-login destinations (no open redirects):
 * must start with a single "/", no backslashes, no scheme or protocol-relative tricks.
 */
export function safeReturnTo(raw: string | null | undefined, fallback = '/'): string {
  if (!raw || raw.length > 1024) return fallback;
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return fallback;
  for (let i = 0; i < raw.length; i++)
    if (raw.charCodeAt(i) < 0x20 || raw.charCodeAt(i) === 0x7f) return fallback;
  try {
    const u = new URL(raw, 'http://placeholder.invalid');
    if (u.origin !== 'http://placeholder.invalid') return fallback;
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return fallback;
  }
}
