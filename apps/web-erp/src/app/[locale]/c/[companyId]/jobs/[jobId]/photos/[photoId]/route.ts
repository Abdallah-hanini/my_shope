import { NextResponse, type NextRequest } from 'next/server';
import { webConfig } from '@/lib/config';
import { sessionForAction } from '@/lib/session';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A job photo (or ?size=thumb) from the API with the session's token, which stays on the server. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string; jobId: string; photoId: string }> },
) {
  const { companyId, jobId, photoId } = await params;
  if (![companyId, jobId, photoId].every((x) => UUID.test(x)))
    return new NextResponse('Not found', { status: 404 });
  const session = await sessionForAction();
  if (!session)
    return new NextResponse('Signed out', { status: 401, headers: { 'cache-control': 'no-store' } });
  const size = req.nextUrl.searchParams.get('size') === 'thumb' ? '?size=thumb' : '';
  let res: Response;
  try {
    res = await fetch(
      `${webConfig().API_INTERNAL_URL}/api/v1/companies/${companyId}/jobs/${jobId}/photos/${photoId}${size}`,
      {
        headers: { authorization: `Bearer ${session.accessToken}` },
        cache: 'no-store',
      },
    );
  } catch {
    return new NextResponse('Unavailable', { status: 503 });
  }
  if (!res.ok || !res.body) return new NextResponse(null, { status: res.status === 404 ? 404 : res.status });
  return new NextResponse(res.body, {
    headers: {
      'content-type': 'image/jpeg',
      'cache-control': 'private, max-age=86400, immutable',
      'x-content-type-options': 'nosniff',
      'content-disposition': 'inline',
    },
  });
}
