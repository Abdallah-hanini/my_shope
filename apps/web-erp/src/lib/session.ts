import 'server-only';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { signInConfig, type SignInConfig } from './config';
import { oidc, oidcConfiguration } from './oidc';
import {
  chunk,
  deriveKey,
  safeReturnTo,
  seal,
  unchunk,
  unseal,
  type LoginState,
  type SessionData,
} from './session-crypto';

export const SESSION_COOKIE = 'erp_session';
export const LOGIN_COOKIE = 'erp_login';
/** Refresh this long before the access token expires. */
const REFRESH_MARGIN_SECONDS = 30;

type CookieStore = Awaited<ReturnType<typeof cookies>>;

function cookieOptions(c: SignInConfig, maxAgeSeconds: number, path = '/') {
  return {
    httpOnly: true,
    secure: c.publicUrl.startsWith('https://'),
    sameSite: 'lax' as const,
    path,
    maxAge: Math.max(0, Math.floor(maxAgeSeconds)),
  };
}

export async function readSession(): Promise<SessionData | null> {
  const c = signInConfig();
  if (!c) return null;
  const jar = await cookies();
  return unseal<SessionData>(
    unchunk(SESSION_COOKIE, (n) => jar.get(n)?.value),
    deriveKey(c.sessionSecret, 'session'),
  );
}

/** Writes the session (route handlers and server actions only). */
export async function writeSession(jar: CookieStore, c: SignInConfig, s: SessionData): Promise<void> {
  const token = await seal(s, deriveKey(c.sessionSecret, 'session'), s.refreshTokenExpiresAt);
  clearSessionCookies(jar);
  const ttl = s.refreshTokenExpiresAt - Math.floor(Date.now() / 1000);
  chunk(token).forEach((part, i) => jar.set(`${SESSION_COOKIE}.${i}`, part, cookieOptions(c, ttl)));
}

export function clearSessionCookies(jar: CookieStore): void {
  for (const cookie of jar.getAll()) {
    if (cookie.name.startsWith(`${SESSION_COOKIE}.`)) jar.delete(cookie.name);
  }
}

export async function writeLoginState(jar: CookieStore, c: SignInConfig, state: LoginState): Promise<void> {
  const exp = Math.floor(Date.now() / 1000) + 600;
  jar.set(
    LOGIN_COOKIE,
    await seal(state, deriveKey(c.sessionSecret, 'login'), exp),
    cookieOptions(c, 600, '/session'),
  );
}

export async function takeLoginState(jar: CookieStore, c: SignInConfig): Promise<LoginState | null> {
  const value = jar.get(LOGIN_COOKIE)?.value;
  jar.delete({ name: LOGIN_COOKIE, path: '/session' });
  return unseal<LoginState>(value, deriveKey(c.sessionSecret, 'login'));
}

export function sessionFromTokens(
  t: oidc.TokenEndpointResponse & oidc.TokenEndpointResponseHelpers,
  previous?: SessionData,
): SessionData {
  const now = Math.floor(Date.now() / 1000);
  const claims = t.claims();
  const sub = claims?.sub ?? previous?.sub;
  const refreshExpiresIn = Number((t as unknown as { refresh_expires_in?: number }).refresh_expires_in ?? 0);
  if (!sub || !t.refresh_token) throw new Error('token response is missing sub or refresh_token');
  return {
    sub,
    accessToken: t.access_token,
    accessTokenExpiresAt: now + (t.expires_in ?? 60),
    refreshToken: t.refresh_token,
    // Keycloak reports refresh_expires_in; fall back to 8 hours if absent.
    refreshTokenExpiresAt: now + (refreshExpiresIn > 0 ? refreshExpiresIn : 8 * 3600),
    idToken: t.id_token ?? previous?.idToken ?? '',
  };
}

/** Exchanges the refresh token; returns null when the session can no longer be renewed. */
export async function refreshSession(c: SignInConfig, s: SessionData): Promise<SessionData | null> {
  try {
    const tokens = await oidc.refreshTokenGrant(oidcConfiguration(c), s.refreshToken);
    return sessionFromTokens(tokens, s);
  } catch (err) {
    console.warn('session refresh failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

/** Path of the current request (set by middleware), for returning after sign-in or refresh. */
export async function currentPath(): Promise<string> {
  return safeReturnTo((await headers()).get('x-erp-path'));
}

/**
 * For Server Components: returns a session with a fresh access token, or redirects to sign-in /
 * refresh (cookies can only be changed in route handlers, so refresh happens there).
 */
export async function requireSession(): Promise<SessionData> {
  const path = await currentPath();
  const s = await readSession();
  if (!s) redirect(`/session/login?returnTo=${encodeURIComponent(path)}`);
  if (s.accessTokenExpiresAt - REFRESH_MARGIN_SECONDS <= Math.floor(Date.now() / 1000)) {
    redirect(`/session/refresh?returnTo=${encodeURIComponent(path)}`);
  }
  return s;
}

/** For Server Actions: refreshes in place when needed (actions may set cookies). */
export async function sessionForAction(): Promise<SessionData | null> {
  const c = signInConfig();
  const s = await readSession();
  if (!c || !s) return null;
  if (s.accessTokenExpiresAt - REFRESH_MARGIN_SECONDS > Math.floor(Date.now() / 1000)) return s;
  const renewed = await refreshSession(c, s);
  const jar = await cookies();
  if (!renewed) {
    clearSessionCookies(jar);
    return null;
  }
  await writeSession(jar, c, renewed);
  return renewed;
}
