import { resolveLocale } from '@erp/localization';
import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { signInConfig } from '@/lib/config';
import { oidc, oidcConfiguration } from '@/lib/oidc';
import { safeReturnTo } from '@/lib/session-crypto';
import { writeLoginState } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const c = signInConfig();
  const returnTo = safeReturnTo(req.nextUrl.searchParams.get('returnTo'), '/');
  const locale = resolveLocale(returnTo.split('/')[1]);
  if (!c) return new NextResponse('Sign-in is not configured on this server.', { status: 503 });

  const codeVerifier = oidc.randomPKCECodeVerifier();
  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  await writeLoginState(await cookies(), c, { codeVerifier, state, nonce, returnTo });

  const url = oidc.buildAuthorizationUrl(oidcConfiguration(c), {
    redirect_uri: `${c.publicUrl}/session/callback`,
    scope: 'openid',
    code_challenge: await oidc.calculatePKCECodeChallenge(codeVerifier),
    code_challenge_method: 'S256',
    state,
    nonce,
    ui_locales: locale,
  });
  return NextResponse.redirect(url.href, 303);
}
