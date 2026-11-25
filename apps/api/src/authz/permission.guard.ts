import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { forbidden, notFound } from '../common/errors';
import { REQUIRED_PERMISSION } from '../auth/decorators';
import type { AuthedRequest } from '../auth/principal';
import { AuthzService } from './authz.service';
import { resolveScope } from './scope';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolves the caller's scope in :companyId for the route's permission. A company the caller has
 * no role in answers 404, not 403, so company ids cannot be probed.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authz: AuthzService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const permission = this.reflector.getAllAndOverride<string | undefined>(REQUIRED_PERMISSION, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!permission) return true;
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const raw: unknown = req.params.companyId;
    const companyId = typeof raw === 'string' ? raw : undefined;
    if (!req.principal) return false;
    if (!companyId || !UUID.test(companyId)) throw notFound('Company');
    const grants = await this.authz.grants(req.principal.userId, companyId);
    if (grants.length === 0) throw notFound('Company');
    const scope = resolveScope(companyId, permission, grants);
    if (!scope) throw forbidden(`Missing permission ${permission}`);
    req.scope = scope;
    return true;
  }
}
