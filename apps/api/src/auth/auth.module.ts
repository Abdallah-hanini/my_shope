import { DynamicModule, Global, Module } from '@nestjs/common';
import type { JWTVerifyGetKey } from 'jose';
import { APP_GUARD } from '@nestjs/core';
import { API_ENV, type ApiEnv } from '../config/env';
import { AuthzService } from '../authz/authz.service';
import { PermissionGuard } from '../authz/permission.guard';
import { AuthGuard } from './auth.guard';
import { createKeyResolver, JWT_KEY_RESOLVER } from './jwks';

@Global()
@Module({})
export class AuthModule {
  /** keyResolver overrides the remote JWKS; used by integration tests with a locally generated key. */
  static register(keyResolver?: JWTVerifyGetKey): DynamicModule {
    return {
      module: AuthModule,
      providers: [
        {
          provide: JWT_KEY_RESOLVER,
          inject: [API_ENV],
          useFactory: (env: ApiEnv) => keyResolver ?? createKeyResolver(env),
        },
        AuthzService,
        // Order matters: authenticate first, then resolve company scope.
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_GUARD, useClass: PermissionGuard },
      ],
      exports: [AuthzService, JWT_KEY_RESOLVER],
    };
  }
}
