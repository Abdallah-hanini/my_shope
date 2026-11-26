import { HttpException } from '@nestjs/common';
import {
  generateTemporaryPassword,
  KeycloakProvisioner,
  ProvisioningConflict,
  ProvisioningUnavailable,
  UnconfiguredProvisioner,
} from './identity-provisioner';

type Call = { url: string; method: string; body?: string; auth?: string };

function fakeKeycloak(responses: ((c: Call) => Response)[]) {
  const calls: Call[] = [];
  let i = 0;
  const impl = (async (url: string, init: RequestInit) => {
    const call = {
      url,
      method: init.method ?? 'GET',
      body: typeof init.body === 'string' ? init.body : init.body?.toString(),
      auth: (init.headers as Record<string, string> | undefined)?.authorization,
    };
    calls.push(call);
    const next = responses[i++];
    if (!next) throw new Error(`unexpected call ${call.method} ${url}`);
    return next(call);
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const token = () =>
  new Response(JSON.stringify({ access_token: 'svc-token', expires_in: 300 }), { status: 200 });

describe('KeycloakProvisioner', () => {
  it('creates a user with the service-account token and returns the id from Location', async () => {
    const kc = fakeKeycloak([
      token,
      () =>
        new Response(null, {
          status: 201,
          headers: { location: 'http://kc/admin/realms/erp/users/abc-123' },
        }),
    ]);
    const p = new KeycloakProvisioner('http://kc', 'erp', 'erp-api-admin', 'secret', 'https://iss', kc.impl);
    const id = await p.createUser({
      username: 'ahmed',
      email: 'a@shop.test',
      firstName: 'A',
      lastName: 'K',
      locale: 'ar',
      requiredActions: ['UPDATE_PASSWORD', 'CONFIGURE_TOTP'],
    });
    expect(id).toBe('abc-123');
    expect(kc.calls[0]).toMatchObject({
      url: 'http://kc/realms/erp/protocol/openid-connect/token',
      method: 'POST',
    });
    expect(kc.calls[0]!.body).toContain('grant_type=client_credentials');
    expect(kc.calls[1]).toMatchObject({
      url: 'http://kc/admin/realms/erp/users',
      method: 'POST',
      auth: 'Bearer svc-token',
    });
    expect(JSON.parse(kc.calls[1]!.body!)).toMatchObject({
      username: 'ahmed',
      enabled: true,
      requiredActions: ['UPDATE_PASSWORD', 'CONFIGURE_TOTP'],
    });
  });

  it('reuses the token until it nears expiry and retries once after a 401', async () => {
    const kc = fakeKeycloak([
      token,
      () => new Response(null, { status: 204 }),
      () => new Response(null, { status: 401 }),
      token,
      () => new Response(null, { status: 204 }),
    ]);
    const p = new KeycloakProvisioner('http://kc', 'erp', 'c', 's', 'https://iss', kc.impl);
    await p.setEnabled('u1', false);
    await p.logoutSessions('u1');
    expect(kc.calls.map((c) => c.url.replace('http://kc', ''))).toEqual([
      '/realms/erp/protocol/openid-connect/token',
      '/admin/realms/erp/users/u1',
      '/admin/realms/erp/users/u1/logout',
      '/realms/erp/protocol/openid-connect/token',
      '/admin/realms/erp/users/u1/logout',
    ]);
  });

  it('maps 409 to a conflict and other failures to 502 without echoing the response body', async () => {
    const kc = fakeKeycloak([
      token,
      () => new Response('{"errorMessage":"User exists with same username"}', { status: 409 }),
      () => new Response('{"error":"password policy: secret-value"}', { status: 400 }),
    ]);
    const p = new KeycloakProvisioner('http://kc', 'erp', 'c', 's', 'https://iss', kc.impl);
    await expect(
      p.createUser({
        username: 'x1x',
        email: 'x@y.z',
        firstName: 'x',
        lastName: 'y',
        locale: 'en',
        requiredActions: [],
      }),
    ).rejects.toBeInstanceOf(ProvisioningConflict);
    const err = (await p.setTemporaryPassword('u1', 'pw').catch((e: unknown) => e)) as HttpException;
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(502);
    expect(err.message).not.toContain('secret-value');
  });

  it('reports an unreachable identity server as 503', async () => {
    const impl = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    const p = new KeycloakProvisioner('http://kc', 'erp', 'c', 's', 'https://iss', impl);
    const err = (await p.deleteUser('u1').catch((e: unknown) => e)) as HttpException;
    expect(err.getStatus()).toBe(503);
  });

  it('treats deleting an already-missing account as done', async () => {
    const kc = fakeKeycloak([token, () => new Response(null, { status: 404 })]);
    await expect(
      new KeycloakProvisioner('http://kc', 'erp', 'c', 's', 'i', kc.impl).deleteUser('gone'),
    ).resolves.toBeUndefined();
  });
});

describe('provisioning helpers', () => {
  it('generates distinct 16-character temporary passwords', () => {
    const a = generateTemporaryPassword();
    expect(a).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(generateTemporaryPassword()).not.toBe(a);
  });

  it('the unconfigured provisioner refuses with 503 instead of pretending', async () => {
    await expect(new UnconfiguredProvisioner().createUser()).rejects.toBeInstanceOf(ProvisioningUnavailable);
  });
});
