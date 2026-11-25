import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { signInConfig } from '@/lib/config';
import { oidc, oidcConfiguration } from '@/lib/oidc';
import { clearSessionCookies, readSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** POST only, from our own pages (Origin check), so other sites cannot sign staff out. */
export async function POST(req: NextRequest) {
  const c = signInConfig();
  if (!c) return new NextResponse('Sign-in is not configured on this server.', { status: 503 });
  if (req.headers.get('origin') !== c.publicUrl) return new NextResponse('Forbidden', { status: 403 });
  const session = await readSession();
  clearSessionCookies(await cookies());
  if (!session?.idToken) return NextResponse.redirect(`${c.publicUrl}/`, 303);
  // Also end the Keycloak session so the next visitor on a shared device must sign in again.
  const url = oidc.buildEndSessionUrl(oidcConfiguration(c), {
    id_token_hint: session.idToken,
    post_logout_redirect_uri: `${c.publicUrl}/`,
  });
  return NextResponse.redirect(url.href, 303);
}
