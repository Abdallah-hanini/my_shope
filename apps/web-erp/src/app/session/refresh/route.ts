import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { signInConfig } from '@/lib/config';
import { safeReturnTo } from '@/lib/session-crypto';
import { clearSessionCookies, readSession, refreshSession, writeSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const c = signInConfig();
  const returnTo = safeReturnTo(req.nextUrl.searchParams.get('returnTo'), '/');
  if (!c) return new NextResponse('Sign-in is not configured on this server.', { status: 503 });
  const jar = await cookies();
  const current = await readSession();
  const renewed = current ? await refreshSession(c, current) : null;
  if (!renewed) {
    clearSessionCookies(jar);
    return NextResponse.redirect(
      `${c.publicUrl}/session/login?returnTo=${encodeURIComponent(returnTo)}`,
      303,
    );
  }
  await writeSession(jar, c, renewed);
  return NextResponse.redirect(`${c.publicUrl}${returnTo}`, 303);
}
