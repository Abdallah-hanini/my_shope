import { createRemoteJWKSet, type JWTVerifyGetKey } from 'jose';
import type { ApiEnv } from '../config/env';

export const JWT_KEY_RESOLVER = Symbol('JWT_KEY_RESOLVER');

/** Remote JWKS of the configured OIDC provider; null when authentication is not configured. */
export function createKeyResolver(env: ApiEnv): JWTVerifyGetKey | null {
  if (!env.OIDC_JWKS_URL) return null;
  return createRemoteJWKSet(new URL(env.OIDC_JWKS_URL), { timeoutDuration: 3000, cooldownDuration: 30000 });
}
