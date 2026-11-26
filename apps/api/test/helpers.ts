import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWK, type KeyLike } from 'jose';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/bootstrap';
import { loadApiEnv } from '../src/config/env';

export const ISSUER = 'https://issuer.erp.test/realms/erp';
export const AUDIENCE = 'erp-api';

/**
 * A real asymmetric key pair generated per test run stands in for the OIDC provider's signing key.
 * Tokens go through the same jose verification as production; only the JWKS source differs.
 */
export interface TestAuth {
  sign: (
    sub: string,
    overrides?: { iss?: string; aud?: string; expSeconds?: number; key?: KeyLike },
  ) => Promise<string>;
  otherKey: KeyLike;
}

export async function createTestAuth(): Promise<{
  auth: TestAuth;
  jwks: ReturnType<typeof createLocalJWKSet>;
}> {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const other = await generateKeyPair('RS256');
  const jwk: JWK = { ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'RS256', use: 'sig' };
  const jwks = createLocalJWKSet({ keys: [jwk] });
  const auth: TestAuth = {
    otherKey: other.privateKey,
    sign: (sub, o = {}) =>
      new SignJWT({})
        .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
        .setSubject(sub)
        .setIssuer(o.iss ?? ISSUER)
        .setAudience(o.aud ?? AUDIENCE)
        .setIssuedAt()
        .setExpirationTime(Math.floor(Date.now() / 1000) + (o.expSeconds ?? 600))
        .sign(o.key ?? privateKey),
  };
  return { auth, jwks };
}

/**
 * Boots the API against the test database. Export jobs and outbox events are not processed in the
 * background unless a test opts in ({ EXPORT_WORKER: 'on' } / { OUTBOX_DISPATCHER: 'on' }); tests
 * drive ExportService.process and OutboxDispatcher.drain directly.
 */
export async function bootApp(
  overrides: Record<string, string> = {},
): Promise<{ app: INestApplication; auth: TestAuth; prisma: PrismaClient }> {
  const env = loadApiEnv({
    ...process.env,
    EXPORT_WORKER: 'off',
    OUTBOX_DISPATCHER: 'off',
    ...overrides,
    LOG_LEVEL: 'error',
    OIDC_ISSUER: ISSUER,
    OIDC_AUDIENCE: AUDIENCE,
    OIDC_JWKS_URL: `${ISSUER}/protocol/openid-connect/certs`,
  });
  const { auth, jwks } = await createTestAuth();
  const app = await createApp(env, { bufferLogs: false, keyResolver: jwks });
  await app.init();
  return { app, auth, prisma: new PrismaClient() };
}

export const uid = () => randomUUID().slice(0, 8);

/** Directly provisions a user, as the bootstrap CLI or a platform admin would. */
export async function createUser(prisma: PrismaClient, opts: { platformAdmin?: boolean } = {}) {
  const sub = `user-${randomUUID()}`;
  const user = await prisma.user.create({
    data: {
      oidcIssuer: ISSUER,
      oidcSubject: sub,
      email: `${sub}@example.test`,
      displayName: sub,
      isPlatformAdmin: !!opts.platformAdmin,
    },
  });
  return { ...user, sub };
}

export function api(app: INestApplication, token?: string) {
  const server = app.getHttpServer();
  const withAuth = (r: request.Test) => (token ? r.set('Authorization', `Bearer ${token}`) : r);
  return {
    get: (url: string) => withAuth(request(server).get(`/api/v1${url}`)),
    post: (url: string, body?: object, headers: Record<string, string> = {}) =>
      withAuth(request(server).post(`/api/v1${url}`))
        .set(headers)
        .send(body ?? {}),
    patch: (url: string, body?: object) => withAuth(request(server).patch(`/api/v1${url}`)).send(body ?? {}),
    delete: (url: string) => withAuth(request(server).delete(`/api/v1${url}`)),
  };
}
