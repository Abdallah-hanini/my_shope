import { aggregate, runCheck, sanitize } from './health.service';

describe('health checks', () => {
  it('reports up with latency when the probe resolves', async () => {
    const r = await runCheck('database', async () => 1);
    expect(r).toMatchObject({ name: 'database', status: 'up' });
    expect(r.latencyMs).toBeGreaterThanOrEqual(0);
    expect(r.error).toBeUndefined();
  });

  it('reports down with a reason when the probe rejects', async () => {
    const r = await runCheck('cache', async () => {
      throw new Error('ECONNREFUSED 127.0.0.1:6379');
    });
    expect(r).toMatchObject({ name: 'cache', status: 'down', error: 'ECONNREFUSED 127.0.0.1:6379' });
  });

  it('times out a hanging probe instead of hanging the request', async () => {
    const r = await runCheck('queue', () => new Promise(() => undefined), 50);
    expect(r.status).toBe('down');
    expect(r.error).toMatch(/timed out/);
  });

  it('redacts connection strings from failure reasons', () => {
    expect(sanitize(new Error('cannot reach postgresql://erp:secret@db:5432/erp now'))).toBe(
      'cannot reach [redacted-url] now',
    );
  });

  it('is up only when every dependency is up', () => {
    const up = { name: 'database' as const, status: 'up' as const, latencyMs: 1 };
    const down = { name: 'cache' as const, status: 'down' as const, latencyMs: 1 };
    expect(aggregate([up]).status).toBe('up');
    expect(aggregate([up, down]).status).toBe('down');
    expect(aggregate([up], new Date('2026-01-01T00:00:00Z')).checkedAt).toBe('2026-01-01T00:00:00.000Z');
  });
});
