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
    if (env.NODE_ENV === 'production' && env.OIDC_JWKS_URL && !env.OIDC_JWKS_URL.startsWith('https://')) {
      ctx.addIssue({ code: 'custom', path: ['OIDC_JWKS_URL'], message: 'must use https in production' });
    }
  });
export type ApiEnv = z.infer<typeof apiEnvSchema>;

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
