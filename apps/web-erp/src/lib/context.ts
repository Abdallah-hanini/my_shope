import 'server-only';
import { unwrap, type Company, type Me } from '@erp/api-client';
import type { Locale } from '@erp/localization';
import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';
import { apiFor, attempt, type Api, type Result } from './api';
import { currentPath, requireSession } from './session';

export interface UserContext {
  api: Api;
  me: Me;
}

/** Signed-in user with profile; redirects to sign-in / refresh when needed. Cached per request. */
export const loadUser = cache(async (): Promise<Result<UserContext>> => {
  const session = await requireSession();
  const api = apiFor(session.accessToken);
  const me = await attempt(async () => unwrap(await api.GET('/api/v1/me')));
  if (!me.ok && me.status === 401) {
    redirect(`/session/refresh?returnTo=${encodeURIComponent(await currentPath())}`);
  }
  return me.ok ? { ok: true, data: { api, me: me.data } } : me;
});

export interface CompanyContext extends UserContext {
  company: Company;
  permissions: Set<string>;
  can: (permission: string) => boolean;
}

/** Company the user holds a role in; 404 otherwise (the API answers 404 for foreign companies too). */
export const loadCompany = cache(async (companyId: string): Promise<Result<CompanyContext>> => {
  const user = await loadUser();
  if (!user.ok) return user;
  const membership = user.data.me.companies.find((c) => c.companyId === companyId);
  if (!membership) notFound();
  const company = await attempt(async () =>
    unwrap(await user.data.api.GET('/api/v1/companies/{companyId}', { params: { path: { companyId } } })),
  );
  if (!company.ok) {
    if (company.status === 404) notFound();
    return company;
  }
  const permissions = new Set(membership.permissions);
  return {
    ok: true,
    data: { ...user.data, company: company.data, permissions, can: (p) => permissions.has(p) },
  };
});

export function companyName(c: { legalName: string; legalNameAr?: string | null }, locale: Locale): string {
  return locale === 'ar' && c.legalNameAr ? c.legalNameAr : c.legalName;
}

export function localName(x: { name: string; nameAr?: string | null }, locale: Locale): string {
  return locale === 'ar' && x.nameAr ? x.nameAr : x.name;
}
