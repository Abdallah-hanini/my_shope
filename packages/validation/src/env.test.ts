import { apiEnvSchema, EnvValidationError, parseEnv, workerEnvSchema } from './env';

const valid = {
  DATABASE_URL: 'postgresql://erp:secret@localhost:5432/erp',
  REDIS_CACHE_URL: 'redis://localhost:6379',
  REDIS_QUEUE_URL: 'redis://localhost:6380',
};

describe('parseEnv', () => {
  it('applies defaults for optional values', () => {
    const env = parseEnv(apiEnvSchema, valid);
    expect(env.API_PORT).toBe(4000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.API_CORS_ORIGINS).toEqual(['http://localhost:3000']);
  });

  it('splits and trims CORS origins', () => {
    const env = parseEnv(apiEnvSchema, { ...valid, API_CORS_ORIGINS: 'http://a.test, http://b.test ,' });
    expect(env.API_CORS_ORIGINS).toEqual(['http://a.test', 'http://b.test']);
  });

  it('rejects a missing database URL and names the variable', () => {
    const { DATABASE_URL: _omit, ...rest } = valid;
    expect(() => parseEnv(apiEnvSchema, rest)).toThrow(EnvValidationError);
    expect(() => parseEnv(apiEnvSchema, rest)).toThrow(/DATABASE_URL/);
  });

  it('rejects a non-postgres database URL', () => {
    expect(() => parseEnv(apiEnvSchema, { ...valid, DATABASE_URL: 'mysql://x@localhost/db' })).toThrow(
      /postgres:\/\//,
    );
  });

  it('rejects an out-of-range port', () => {
    expect(() => parseEnv(apiEnvSchema, { ...valid, API_PORT: '70000' })).toThrow(/API_PORT/);
  });

  it('never echoes secret values in the error message', () => {
    const secret = 'super-secret-password-123';
    try {
      parseEnv(apiEnvSchema, { ...valid, DATABASE_URL: `notaurl${secret}` });
      throw new Error('expected failure');
    } catch (e) {
      expect(e).toBeInstanceOf(EnvValidationError);
      expect((e as Error).message).not.toContain(secret);
    }
  });

  it('validates the worker environment independently of the cache', () => {
    const env = parseEnv(workerEnvSchema, { REDIS_QUEUE_URL: valid.REDIS_QUEUE_URL });
    expect(env.WORKER_HEALTH_PORT).toBe(4100);
  });
});

describe('OIDC settings', () => {
  const oidc = {
    OIDC_ISSUER: 'https://id.example.test/realms/erp',
    OIDC_AUDIENCE: 'erp-api',
    OIDC_JWKS_URL: 'https://id.example.test/realms/erp/certs',
  };

  it('are optional in development', () => {
    expect(parseEnv(apiEnvSchema, valid).OIDC_ISSUER).toBeUndefined();
  });

  it('must be set together', () => {
    expect(() => parseEnv(apiEnvSchema, { ...valid, OIDC_ISSUER: oidc.OIDC_ISSUER })).toThrow(/set together/);
  });

  it('are required in production', () => {
    expect(() => parseEnv(apiEnvSchema, { ...valid, NODE_ENV: 'production' })).toThrow(
      /required in production/,
    );
    expect(parseEnv(apiEnvSchema, { ...valid, ...oidc, NODE_ENV: 'production' }).OIDC_AUDIENCE).toBe(
      'erp-api',
    );
  });

  it('require https JWKS in production', () => {
    expect(() =>
      parseEnv(apiEnvSchema, {
        ...valid,
        ...oidc,
        OIDC_JWKS_URL: 'http://id.example.test/certs',
        NODE_ENV: 'production',
      }),
    ).toThrow(/https/);
  });
});
