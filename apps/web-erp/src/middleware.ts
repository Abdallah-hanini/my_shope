import { isLocale } from '@erp/localization';
import { NextResponse, type NextRequest } from 'next/server';
import { negotiateLocale } from './lib/locale';

export function middleware(req: NextRequest) {
  const first = req.nextUrl.pathname.split('/')[1];
  if (isLocale(first)) {
    // Pages read this to return here after sign-in or a session refresh.
    const headers = new Headers(req.headers);
    headers.set('x-erp-path', `${req.nextUrl.pathname}${req.nextUrl.search}`);
    return NextResponse.next({ request: { headers } });
  }
  const locale = negotiateLocale(req.headers.get('accept-language'));
  const url = req.nextUrl.clone();
  url.pathname = `/${locale}${req.nextUrl.pathname === '/' ? '' : req.nextUrl.pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Skip Next internals, static files, the web liveness endpoint and /session/* (OIDC sign-in
  // callbacks, which must keep the exact redirect URI registered in Keycloak).
  matcher: ['/((?!_next|healthz|session|favicon.ico|.*\\..*).*)'],
};
