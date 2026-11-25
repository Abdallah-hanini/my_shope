import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { AuthedRequest, CompanyScope, Principal } from './principal';

export const IS_PUBLIC = 'erp:isPublic';
export const REQUIRED_PERMISSION = 'erp:permission';
export const PLATFORM_ADMIN_ONLY = 'erp:platformAdmin';

/** No authentication (health checks only). */
export const Public = () => SetMetadata(IS_PUBLIC, true);
/** Route lives under /companies/:companyId and needs this permission in that company. */
export const RequirePermission = (permission: string) => SetMetadata(REQUIRED_PERMISSION, permission);
export const PlatformAdminOnly = () => SetMetadata(PLATFORM_ADMIN_ONLY, true);

export const CurrentPrincipal = createParamDecorator((_: unknown, ctx: ExecutionContext): Principal => {
  const p = ctx.switchToHttp().getRequest<AuthedRequest>().principal;
  if (!p) throw new Error('CurrentPrincipal used on a route without authentication');
  return p;
});

export const CurrentScope = createParamDecorator((_: unknown, ctx: ExecutionContext): CompanyScope => {
  const s = ctx.switchToHttp().getRequest<AuthedRequest>().scope;
  if (!s) throw new Error('CurrentScope used on a route without @RequirePermission');
  return s;
});

export const RequestId = createParamDecorator((_: unknown, ctx: ExecutionContext): string | undefined => {
  const id: unknown = (ctx.switchToHttp().getRequest<AuthedRequest>() as { id?: unknown }).id;
  return typeof id === 'string' || typeof id === 'number' ? String(id) : undefined;
});
