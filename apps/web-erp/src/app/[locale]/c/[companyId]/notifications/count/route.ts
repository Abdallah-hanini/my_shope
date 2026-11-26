import { NextResponse } from 'next/server';
import { webConfig } from '@/lib/config';
import { sessionForAction } from '@/lib/session';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Unread count for the header bell (JSON). The API checks membership; the token stays on the server. */
export async function GET(_req: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const headers = { 'cache-control': 'no-store' };
  if (!UUID.test(companyId)) return NextResponse.json({ error: 'not found' }, { status: 404, headers });
  const session = await sessionForAction();
  if (!session) return NextResponse.json({ error: 'signed out' }, { status: 401, headers });
  try {
    const res = await fetch(
      `${webConfig().API_INTERNAL_URL}/api/v1/companies/${companyId}/notifications/unread-count`,
      {
        headers: { authorization: `Bearer ${session.accessToken}` },
        cache: 'no-store',
      },
    );
    if (!res.ok) return NextResponse.json({ error: 'unavailable' }, { status: res.status, headers });
    const body = (await res.json()) as { unreadCount: number };
    return NextResponse.json({ unreadCount: body.unreadCount }, { headers });
  } catch {
    return NextResponse.json({ error: 'unavailable' }, { status: 503, headers });
  }
}
