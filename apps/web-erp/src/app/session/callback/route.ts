import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { signInConfig } from '@/lib/config';
import { oidc, oidcConfiguration } from '@/lib/oidc';
import { sessionFromTokens, takeLoginState, writeSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const c = signInConfig();
  if (!c) return new NextResponse('Sign-in is not configured on this server.', { status: 503 });
  const jar = await cookies();
  const login = await takeLoginState(jar, c);
  const fail = (reason: string) => NextResponse.redirect(`${c.publicUrl}/?signin=${reason}`, 303);
  if (!login) return fail('expired');
  if (req.nextUrl.searchParams.get('error')) return fail('denied');

  // Behind the reverse proxy the request URL is internal; validate against the public callback URL.
  const callbackUrl = new URL(`${c.publicUrl}/session/callback${req.nextUrl.search}`);
  try {
    const tokens = await oidc.authorizationCodeGrant(oidcConfiguration(c), callbackUrl, {
      pkceCodeVerifier: login.codeVerifier,
      expectedState: login.state,
      expectedNonce: login.nonce,
      idTokenExpected: true,
    });
    await writeSession(jar, c, sessionFromTokens(tokens));
  } catch (err) {
    console.warn('sign-in callback rejected:', err instanceof Error ? err.message : err);
    return fail('failed');
  }
  return NextResponse.redirect(`${c.publicUrl}${login.returnTo}`, 303);
}
