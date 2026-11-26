import { z } from 'zod';

const port = z.coerce.number().int().min(1).max(65535);

const postgresUrl = z
  .string()
  .url()
  .refine((v) => v.startsWith('postgres://') || v.startsWith('postgresql://'), 'must be a postgres:// URL');

const redisUrl = z
  .string()
  .url()
  .refine((v) => v.startsWith('redis://') || v.startsWith('rediss://'), 'must be a redis:// URL');

const nodeEnv = z.enum(['development', 'test', 'production']).default('development');

export const apiEnvSchema = z
  .object({
    NODE_ENV: nodeEnv,
    API_PORT: port.default(4000),
    API_CORS_ORIGINS: z
      .string()
      .default('http://localhost:3000')
      .transform((v) =>
        v
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    DATABASE_URL: postgresUrl,
    REDIS_CACHE_URL: redisUrl,
    REDIS_QUEUE_URL: redisUrl,
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    /**
     * OIDC resource-server settings. Any standards-compliant provider works (decision D-03 pending).
     * When unset outside production, protected endpoints answer 401 "authentication not configured".
     */
    OIDC_ISSUER: z.string().url().optional(),
    OIDC_AUDIENCE: z.string().min(1).optional(),
    OIDC_JWKS_URL: z.string().url().optional(),
    /**
     * Keycloak Admin API access for staff onboarding (service client limited to user management
     * in the realm). Base URL without the realm, e.g. http://keycloak:8080/auth. Unset = off.
     */
    KEYCLOAK_ADMIN_BASE_URL: z.string().url().optional(),
    KEYCLOAK_REALM: z.string().min(1).default('erp'),
    KEYCLOAK_ADMIN_CLIENT_ID: z.string().min(1).default('erp-api-admin'),
    KEYCLOAK_ADMIN_CLIENT_SECRET: z.string().min(1).optional(),
  })
  .superRefine((env, ctx) => {
    const set = [env.OIDC_ISSUER, env.OIDC_AUDIENCE, env.OIDC_JWKS_URL].filter(Boolean).length;
    if (set !== 0 && set !== 3) {
      ctx.addIssue({
        code: 'custom',
        path: ['OIDC_ISSUER'],
        message: 'OIDC_ISSUER, OIDC_AUDIENCE and OIDC_JWKS_URL must be set together',
      });
    }
    if (env.NODE_ENV === 'production' && set !== 3) {
      ctx.addIssue({
        code: 'custom',
        path: ['OIDC_ISSUER'],
        message: 'OIDC settings are required in production',
      });
    }
    if (env.NODE_ENV === 'production' && env.OIDC_JWKS_URL && !isSecureJwksUrl(env.OIDC_JWKS_URL)) {
      ctx.addIssue({
        code: 'custom',
        path: ['OIDC_JWKS_URL'],
        message:
          'must use https in production (plain http is allowed only for an internal service name such as http://keycloak:8080)',
      });
    }
    if (Boolean(env.KEYCLOAK_ADMIN_BASE_URL) !== Boolean(env.KEYCLOAK_ADMIN_CLIENT_SECRET)) {
      ctx.addIssue({
        code: 'custom',
        path: ['KEYCLOAK_ADMIN_BASE_URL'],
        message: 'KEYCLOAK_ADMIN_BASE_URL and KEYCLOAK_ADMIN_CLIENT_SECRET must be set together',
      });
    }
    if (
      env.NODE_ENV === 'production' &&
      env.KEYCLOAK_ADMIN_BASE_URL &&
      !isSecureJwksUrl(env.KEYCLOAK_ADMIN_BASE_URL)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['KEYCLOAK_ADMIN_BASE_URL'],
        message: 'must use https or an internal service name',
      });
    }
  });
export type ApiEnv = z.infer<typeof apiEnvSchema>;

/**
 * Web ERP server settings. Sign-in is disabled (with a visible notice) when the OIDC values are
 * absent; production requires them.
 */
export const webEnvSchema = z
  .object({
    NODE_ENV: nodeEnv,
    API_INTERNAL_URL: z.string().url().default('http://localhost:4000'),
    /** Address staff type in the browser, e.g. https://192.168.1.50 (no trailing slash). */
    WEB_PUBLIC_URL: z
      .string()
      .url()
      .transform((v) => v.replace(/\/$/, ''))
      .optional(),
    /** Public issuer, e.g. https://192.168.1.50/auth/realms/erp. */
    OIDC_ISSUER: z.string().url().optional(),
    /** Server-to-server base URL of the same realm, e.g. http://keycloak:8080/auth/realms/erp. */
    OIDC_INTERNAL_BASE_URL: z.string().url().optional(),
    OIDC_CLIENT_ID: z.string().min(1).default('erp-web'),
    OIDC_CLIENT_SECRET: z.string().min(1).optional(),
    /** Key material for the encrypted session cookie: at least 32 characters of random data. */
    WEB_SESSION_SECRET: z.string().min(32, 'must be at least 32 characters').optional(),
  })
  .superRefine((env, ctx) => {
    const required = ['WEB_PUBLIC_URL', 'OIDC_ISSUER', 'OIDC_CLIENT_SECRET', 'WEB_SESSION_SECRET'] as const;
    const set = required.filter((k) => env[k]).length;
    if (set !== 0 && set !== required.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['OIDC_ISSUER'],
        message: `${required.join(', ')} must be set together`,
      });
    }
    if (env.NODE_ENV === 'production' && set !== required.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['OIDC_ISSUER'],
        message: 'web sign-in settings are required in production',
      });
    }
    if (
      env.NODE_ENV === 'production' &&
      env.OIDC_INTERNAL_BASE_URL &&
      !isSecureJwksUrl(env.OIDC_INTERNAL_BASE_URL)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['OIDC_INTERNAL_BASE_URL'],
        message: 'must use https or an internal service name',
      });
    }
  });
export type WebEnv = z.infer<typeof webEnvSchema>;

/**
 * https anywhere, or http to a single-label host (a Docker service name on the private network,
 * e.g. http://keycloak:8080). Public and LAN hostnames or IP addresses must use https.
 */
export function isSecureJwksUrl(raw: string): boolean {
  const url = new URL(raw);
  if (url.protocol === 'https:') return true;
  return url.protocol === 'http:' && /^[a-z][a-z0-9-]*$/i.test(url.hostname) && url.hostname !== 'localhost';
}

export const workerEnvSchema = z.object({
  NODE_ENV: nodeEnv,
  WORKER_HEALTH_PORT: port.default(4100),
  WORKER_HEARTBEAT_MS: z.coerce.number().int().min(1000).default(30000),
  REDIS_QUEUE_URL: redisUrl,
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});
export type WorkerEnv = z.infer<typeof workerEnvSchema>;

export class EnvValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid environment configuration:\n  - ${issues.join('\n  - ')}`);
    this.name = 'EnvValidationError';
  }
}

/**
 * Parses an environment object and fails fast. Error messages name the variable and the rule,
 * never the received value, so secrets cannot leak into logs.
 */
export function parseEnv<S extends z.ZodTypeAny>(
  schema: S,
  source: Record<string, string | undefined>,
): z.infer<S> {
  const result = schema.safeParse(source);
  if (!result.success) {
    throw new EnvValidationError(
      result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    );
  }
  return result.data;
}
