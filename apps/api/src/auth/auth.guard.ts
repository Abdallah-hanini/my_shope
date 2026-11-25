import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { jwtVerify, type JWTVerifyGetKey } from 'jose';
import { API_ENV, type ApiEnv } from '../config/env';
import { forbidden } from '../common/errors';
import { PrismaService } from '../infra/prisma.service';
import { IS_PUBLIC, PLATFORM_ADMIN_ONLY } from './decorators';
import { JWT_KEY_RESOLVER } from './jwks';
import type { AuthedRequest } from './principal';

const BEARER = /^Bearer ([A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+)$/;
const ALGORITHMS = ['RS256', 'RS384', 'RS512', 'PS256', 'PS384', 'PS512', 'ES256', 'ES384', 'EdDSA'];

/**
 * Global guard: every route requires a valid OIDC access token unless marked @Public().
 * The token proves identity only; permissions come from the database (never from token claims).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    @Inject(API_ENV) private readonly env: ApiEnv,
    @Inject(JWT_KEY_RESOLVER) private readonly keys: JWTVerifyGetKey | null,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (!this.keys || !this.env.OIDC_ISSUER || !this.env.OIDC_AUDIENCE) {
      throw new UnauthorizedException('Authentication is not configured on this server');
    }
    const match = BEARER.exec(req.headers.authorization ?? '');
    if (!match?.[1]) throw new UnauthorizedException('Missing bearer token');

    let sub: string;
    let iss: string;
    try {
      const { payload } = await jwtVerify(match[1], this.keys, {
        issuer: this.env.OIDC_ISSUER,
        audience: this.env.OIDC_AUDIENCE,
        algorithms: ALGORITHMS,
        clockTolerance: 30,
        requiredClaims: ['sub', 'exp', 'iss'],
      });
      sub = payload.sub as string;
      iss = payload.iss as string;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const user = await this.prisma.user.findUnique({
      where: { oidcIssuer_oidcSubject: { oidcIssuer: iss, oidcSubject: sub } },
    });
    if (!user || user.status !== 'active') throw forbidden('User is not provisioned or is inactive');
    req.principal = { userId: user.id, email: user.email, isPlatformAdmin: user.isPlatformAdmin };

    if (this.reflector.getAllAndOverride<boolean>(PLATFORM_ADMIN_ONLY, targets) && !user.isPlatformAdmin) {
      throw forbidden('Platform administrator role required');
    }
    return true;
  }
}
