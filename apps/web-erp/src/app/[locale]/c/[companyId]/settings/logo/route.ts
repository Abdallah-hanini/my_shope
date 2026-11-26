import { NextResponse } from 'next/server';
import { webConfig } from '@/lib/config';
import { sessionForAction } from '@/lib/session';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The company logo (PNG) from the API with the session's token, which stays on the server. */
export async function GET(_req: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  if (!UUID.test(companyId)) return new NextResponse('Not found', { status: 404 });
  const session = await sessionForAction();
  if (!session)
    return new NextResponse('Signed out', { status: 401, headers: { 'cache-control': 'no-store' } });
  let res: Response;
  try {
    res = await fetch(`${webConfig().API_INTERNAL_URL}/api/v1/companies/${companyId}/profile/logo`, {
      headers: { authorization: `Bearer ${session.accessToken}` },
      cache: 'no-store',
    });
  } catch {
    return new NextResponse('Unavailable', { status: 503 });
  }
  if (!res.ok || !res.body) return new NextResponse(null, { status: res.status === 404 ? 404 : res.status });
  return new NextResponse(res.body, {
    headers: {
      'content-type': 'image/png',
      'cache-control': 'private, max-age=300',
      'x-content-type-options': 'nosniff',
      'content-disposition': 'inline',
    },
  });
}
