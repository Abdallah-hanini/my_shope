import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from '../src/bootstrap';
import { loadApiEnv } from '../src/config/env';

// Real PostgreSQL + Redis. Requires DATABASE_URL, REDIS_CACHE_URL, REDIS_QUEUE_URL.
const env = loadApiEnv({ ...process.env, LOG_LEVEL: 'error' });

describe('health endpoints (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApp(env, { bufferLogs: false });
    await app.init();
  });
  afterAll(async () => app.close());

  it('GET /api/v1/health/live returns up', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health/live').expect(200);
    expect(res.body).toMatchObject({ status: 'up' });
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('GET /api/v1/health/ready reports every dependency up against real services', async () => {
    // Redis connects in the background on boot; allow it a moment.
    let res = await request(app.getHttpServer()).get('/api/v1/health/ready');
    for (let i = 0; i < 20 && res.status !== 200; i++) {
      await new Promise((r) => setTimeout(r, 250));
      res = await request(app.getHttpServer()).get('/api/v1/health/ready');
    }
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(
      res.body.checks.map((c: { name: string; status: string }) => `${c.name}:${c.status}`).sort(),
    ).toEqual(['cache:up', 'database:up', 'queue:up']);
  });

  it('foundation migration created the domain schemas and extensions', async () => {
    const { PrismaService } = await import('../src/infra/prisma.service');
    const prisma = app.get(PrismaService);
    const schemas = await prisma.$queryRaw<{ nspname: string }[]>`
      SELECT nspname FROM pg_namespace WHERE nspname IN ('platform','iam','org','accounting','inventory','reporting')`;
    expect(schemas.map((s) => s.nspname).sort()).toEqual([
      'accounting',
      'iam',
      'inventory',
      'org',
      'platform',
      'reporting',
    ]);
    const ext = await prisma.$queryRaw<{ extname: string }[]>`
      SELECT extname FROM pg_extension WHERE extname IN ('pgcrypto','pg_trgm')`;
    expect(ext.map((e) => e.extname).sort()).toEqual(['pg_trgm', 'pgcrypto']);
  });

  it('unknown routes return RFC 9457 problem+json', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/does-not-exist').expect(404);
    expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(res.body).toMatchObject({
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
      instance: '/api/v1/does-not-exist',
    });
    expect(res.body.requestId).toBeTruthy();
  });

  it('sets security headers', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health/live');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('readiness with a dependency down (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // Port 1 is never a Redis server: the cache check must fail while the database stays up.
    app = await createApp({ ...env, REDIS_CACHE_URL: 'redis://127.0.0.1:1' }, { bufferLogs: false });
    await app.init();
  });
  afterAll(async () => app.close());

  it('returns 503 with a per-dependency report instead of a generic error', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(503);
    expect(res.body.status).toBe('down');
    const byName = Object.fromEntries(
      res.body.checks.map((c: { name: string; status: string }) => [c.name, c.status]),
    );
    expect(byName).toMatchObject({ database: 'up', cache: 'down' });
  });
});
