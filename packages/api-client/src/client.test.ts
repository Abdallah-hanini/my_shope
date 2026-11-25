import { ApiProblemError, createApiClient, expectOk, unwrap } from './index';

function mockFetch(status: number, body: unknown, seen: Request[] = []) {
  return jest.fn(async (input: Request) => {
    seen.push(input);
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': status >= 400 ? 'application/problem+json' : 'application/json' },
    });
  }) as unknown as typeof fetch;
}

const report = {
  status: 'down',
  checkedAt: '2026-01-01T00:00:00.000Z',
  version: '0.0.0',
  checks: [
    { name: 'database', status: 'up', latencyMs: 2 },
    { name: 'cache', status: 'down', latencyMs: 1000, error: 'timeout' },
  ],
};

describe('createApiClient', () => {
  it('calls the versioned readiness path and sends auth and locale headers', async () => {
    const seen: Request[] = [];
    const client = createApiClient({
      baseUrl: 'http://api.test/',
      fetch: mockFetch(200, { ...report, status: 'up' }, seen),
      getAccessToken: () => 'tkn',
      locale: 'ar',
    });
    const result = await client.ready();
    expect(result.status).toBe('up');
    expect(seen[0]!.url).toBe('http://api.test/api/v1/health/ready');
    expect(seen[0]!.headers.get('authorization')).toBe('Bearer tkn');
    expect(seen[0]!.headers.get('accept-language')).toBe('ar');
  });

  it('returns the degraded report on 503 so the UI can show which dependency failed', async () => {
    const client = createApiClient({ baseUrl: 'http://api.test', fetch: mockFetch(503, report) });
    const result = await client.ready();
    expect(result.status).toBe('down');
    expect(result.checks.find((c) => c.name === 'cache')?.status).toBe('down');
  });

  it('throws ApiProblemError with the RFC 9457 body for other failures', async () => {
    const problem = { type: 'about:blank', title: 'Internal Server Error', status: 500, instance: '/x' };
    const client = createApiClient({ baseUrl: 'http://api.test', fetch: mockFetch(500, problem) });
    await expect(client.ready()).rejects.toBeInstanceOf(ApiProblemError);
    await expect(client.live()).rejects.toMatchObject({
      status: 500,
      problem: { title: 'Internal Server Error' },
    });
  });

  it('does not send an Authorization header when no token is available', async () => {
    const seen: Request[] = [];
    const client = createApiClient({
      baseUrl: 'http://api.test',
      fetch: mockFetch(200, { status: 'up', uptimeSeconds: 1, version: '0.0.0' }, seen),
      getAccessToken: () => undefined,
    });
    await client.live();
    expect(seen[0]!.headers.has('authorization')).toBe(false);
  });
});

describe('unwrap / expectOk', () => {
  const res = (status: number) => new Response(null, { status });

  it('returns data for 2xx', () => {
    expect(unwrap({ data: { a: 1 }, response: res(200) })).toEqual({ a: 1 });
  });

  it('throws the problem for errors', () => {
    const problem = { title: 'Unprocessable Entity', status: 422, detail: 'Journal is not balanced' };
    expect(() => unwrap({ error: problem, response: res(422) })).toThrow(ApiProblemError);
    try {
      unwrap({ error: problem, response: res(422) });
    } catch (e) {
      expect((e as ApiProblemError).problem?.detail).toBe('Journal is not balanced');
      expect((e as ApiProblemError).status).toBe(422);
    }
  });

  it('expectOk accepts 204 and rejects 403', () => {
    expect(() => expectOk({ response: res(204) })).not.toThrow();
    expect(() => expectOk({ error: { title: 'Forbidden' }, response: res(403) })).toThrow('Forbidden');
  });
});
