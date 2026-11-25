import { isLocale } from '@erp/localization';
import { NextResponse, type NextRequest } from 'next/server';
import { negotiateLocale } from './lib/locale';

export function middleware(req: NextRequest) {
  const first = req.nextUrl.pathname.split('/')[1];
  if (isLocale(first)) return NextResponse.next();
  const locale = negotiateLocale(req.headers.get('accept-language'));
  const url = req.nextUrl.clone();
  url.pathname = `/${locale}${req.nextUrl.pathname === '/' ? '' : req.nextUrl.pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Skip Next internals, static files and the web liveness endpoint.
  matcher: ['/((?!_next|healthz|favicon.ico|.*\\..*).*)'],
};
