import { isLocale } from '@erp/localization';
import { NextResponse, type NextRequest } from 'next/server';
import { webConfig } from '@/lib/config';
import { sessionForAction } from '@/lib/session';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Streams an export file from the API with the session's token (the token never reaches the
 * browser). The API checks ownership and permission and audits the download. On refusal the user
 * returns to the export centre with the reason code.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ locale: string; companyId: string; exportId: string }> },
) {
  const { locale, companyId, exportId } = await params;
  if (!isLocale(locale) || !UUID.test(companyId) || !UUID.test(exportId)) {
    return new NextResponse('Not found', { status: 404 });
  }
  const page = `/${locale}/c/${companyId}/exports`;
  const origin = webConfig().WEB_PUBLIC_URL ?? req.nextUrl.origin;
  const back = (status: number) => NextResponse.redirect(new URL(`${page}?error=${status}`, origin), 303);
  const session = await sessionForAction();
  if (!session) {
    return NextResponse.redirect(new URL(`/session/login?returnTo=${encodeURIComponent(page)}`, origin), 303);
  }
  let res: Response;
  try {
    res = await fetch(
      `${webConfig().API_INTERNAL_URL}/api/v1/companies/${companyId}/exports/${exportId}/download`,
      { headers: { authorization: `Bearer ${session.accessToken}` }, cache: 'no-store' },
    );
  } catch {
    return back(503);
  }
  if (!res.ok || !res.body) return back(res.status);
  return new NextResponse(res.body, {
    status: 200,
    headers: {
      'content-type': res.headers.get('content-type') ?? 'application/octet-stream',
      'content-disposition': res.headers.get('content-disposition') ?? 'attachment',
      ...(res.headers.get('content-length') ? { 'content-length': res.headers.get('content-length')! } : {}),
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}
