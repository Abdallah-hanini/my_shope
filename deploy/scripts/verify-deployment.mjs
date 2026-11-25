#!/usr/bin/env node
// End-to-end check of a running shop server (deploy/docker-compose.prod.yml). Run from the repository
// root on the machine where Docker runs:
//   node deploy/scripts/verify-deployment.mjs --env-file deploy/.env
// It exercises the real staff sign-in path through HTTPS, Keycloak (password change + authenticator
// app enrolment), the authorization-code + PKCE token exchange, and the API. It creates one
// clearly named verification user ("verify-<timestamp>") as a platform administrator; disable or
// delete that user in Keycloak afterwards on a live server.
import { spawnSync } from 'node:child_process';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Agent, fetch } from 'undici';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const envFile = resolve(arg('--env-file', join(root, 'deploy/.env')));
const composeFile = join(root, 'deploy/docker-compose.prod.yml');
const env = Object.fromEntries(
  readFileSync(envFile, 'utf8')
    .split('\n')
    .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
const base = env.ERP_PUBLIC_URL;
const issuer = `${base}/auth/realms/erp`;
const results = [];

// Returns stdout and stderr together (the CLIs report success on stderr); throws on a non-zero exit.
const compose = (...args) => {
  const r = spawnSync('docker', ['compose', '-f', composeFile, '--env-file', envFile, ...args], {
    encoding: 'utf8',
  });
  const out = `${r.stdout}${r.stderr}`;
  if (r.status !== 0) throw new Error(`docker compose ${args.join(' ')} failed (${r.status}):\n${out}`);
  return out;
};

async function check(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  ✓ ${name}`);
  } catch (err) {
    results.push({ name, ok: false });
    console.log(`  ✗ ${name}\n      ${err.message}`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// RFC 6238 TOTP (SHA-1, 6 digits, 30 s), as configured in the realm.
function totp(secretBase32, at = Date.now()) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of secretBase32.replace(/\s+/g, '').toUpperCase())
    bits += alphabet.indexOf(c).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const h = createHmac('sha1', key).update(counter).digest();
  const o = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

async function main() {
  console.log(`Verifying ${base}`);

  // 1. TLS: export Caddy's local root CA and require every request to chain to it.
  const caDir = mkdtempSync(join(tmpdir(), 'erp-ca-'));
  const caPath = join(caDir, 'root.crt');
  writeFileSync(caPath, compose('exec', '-T', 'caddy', 'cat', '/data/caddy/pki/authorities/local/root.crt'));
  const dispatcher = new Agent({ connect: { ca: readFileSync(caPath), rejectUnauthorized: true } });
  const get = (path, init = {}) => fetch(`${base}${path}`, { ...init, dispatcher, redirect: 'manual' });

  await check('HTTPS certificate chains to the exported shop root CA', async () => {
    const res = await get('/healthz');
    assert(res.status === 200, `web /healthz HTTP ${res.status}`);
    assert(res.headers.get('strict-transport-security'), 'missing HSTS');
  });
  await check('API readiness through the proxy', async () => {
    const body = await (await get('/api/v1/health/ready')).json();
    assert(body.status === 'up', JSON.stringify(body));
  });
  await check('Keycloak discovery advertises the public issuer', async () => {
    const d = await (await get('/auth/realms/erp/.well-known/openid-configuration')).json();
    assert(d.issuer === issuer, `issuer ${d.issuer}`);
    assert(d.authorization_endpoint.startsWith(`${base}/auth/`), d.authorization_endpoint);
  });
  await check('API rejects requests without a token', async () => {
    const res = await get('/api/v1/me');
    assert(res.status === 401, `HTTP ${res.status}`);
  });
  await check('Direct password grant is disabled for the web client', async () => {
    const res = await get('/auth/realms/erp/protocol/openid-connect/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'password',
        client_id: 'erp-web',
        client_secret: env.ERP_WEB_CLIENT_SECRET,
        username: 'x',
        password: 'y',
      }),
    });
    assert(res.status === 400 || res.status === 401, `HTTP ${res.status}`);
    const body = await res.json();
    assert(body.error === 'unauthorized_client', JSON.stringify(body));
  });

  // 2. Create a verification admin in Keycloak and link it in the ERP (same path as an operator).
  const username = `verify-${Date.now()}`;
  let userId;
  let tempPassword;
  await check('Create a Keycloak user that must change password and enrol TOTP', async () => {
    const out = compose(
      'exec',
      '-T',
      'keycloak',
      'bash',
      '/erp-scripts/bootstrap-admin.sh',
      username,
      `${username}@shop.invalid`,
      'Verify',
      'Admin',
    );
    userId = out.match(/USER_ID=(\S+)/)?.[1];
    tempPassword = out.match(/TEMP_PASSWORD=(\S+)/)?.[1];
    assert(userId && tempPassword, out);
  });
  await check('Provision the same identity as ERP platform administrator', async () => {
    const out = compose(
      'exec',
      '-T',
      'api',
      'node',
      'apps/api/dist/cli/bootstrap-admin.js',
      '--issuer',
      issuer,
      '--subject',
      userId,
      '--email',
      `${username}@shop.invalid`,
      '--name',
      'Verify Admin',
    );
    assert(/Platform administrator ready/.test(out), out);
  });

  // 3. Browser sign-in: authorization code + PKCE (S256).
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const state = randomBytes(16).toString('hex');
  const redirectUri = `${base}/session/callback`;
  const authUrl = `${base}/auth/realms/erp/protocol/openid-connect/auth?${new URLSearchParams({
    client_id: 'erp-web',
    response_type: 'code',
    scope: 'openid',
    redirect_uri: redirectUri,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  })}`;
  let code;
  let secondCode;
  const verifier2 = randomBytes(32).toString('base64url');
  const authUrl2 = authUrl.replace(
    `code_challenge=${challenge}`,
    `code_challenge=${createHash('sha256').update(verifier2).digest('base64url')}`,
  );
  const { chromium } = createRequire(join(root, 'package.json'))('playwright');
  // The browser is told to ignore TLS errors only because it cannot load the local CA here; TLS
  // trust is asserted separately above with the exported root certificate.
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ ignoreHTTPSErrors: true, locale: 'en-GB' });
    await check('Sign in, change temporary password and enrol an authenticator app', async () => {
      await page.goto(authUrl);
      await page.fill('#username', username);
      await page.fill('#password', tempPassword);
      await page.click('#kc-login');
      // Keycloak presents required actions in its own order; handle each until the redirect.
      const done = { password: false, totp: false };
      for (let step = 0; step < 6 && !page.url().startsWith(redirectUri); step++) {
        await page.waitForLoadState('load');
        if (page.url().startsWith(redirectUri)) break;
        if (await page.locator('#password-new').count()) {
          const newPassword = `Vf-${randomBytes(12).toString('base64url')}`;
          await page.fill('#password-new', newPassword);
          await page.fill('#password-confirm', newPassword);
          if (done.password) throw new Error('new password was rejected');
          await Promise.all([page.waitForNavigation(), page.locator('[type=submit]').first().click()]);
          done.password = true;
        } else if (await page.locator('#totpSecret').count()) {
          if (done.totp) throw new Error('authenticator code was rejected');
          // The manual-entry key (Base32) is what an authenticator app uses.
          if (await page.locator('#mode-manual').count()) await page.click('#mode-manual');
          const secret = (await page.locator('#kc-totp-secret-key').innerText()).trim();
          await page.fill('#totp', totp(secret));
          if (await page.locator('#userLabel').count()) await page.fill('#userLabel', 'verification');
          await Promise.all([page.waitForNavigation(), page.click('#saveTOTPBtn')]);
          done.totp = true;
        } else {
          throw new Error(`unexpected page ${page.url()}`);
        }
      }
      assert(done.password && done.totp, `required actions not both completed: ${JSON.stringify(done)}`);
      assert(page.url().startsWith(redirectUri), `ended at ${page.url()}`);
      const url = new URL(page.url());
      assert(url.searchParams.get('state') === state, 'state mismatch');
      code = url.searchParams.get('code');
      assert(code, `no code in ${url}`);
    });
    await check('A second sign-in reuses the SSO session without prompting', async () => {
      const callback = page.waitForURL((u) => u.toString().startsWith(redirectUri), { timeout: 30000 });
      await page.goto(authUrl2);
      await callback;
      secondCode = new URL(page.url()).searchParams.get('code');
      assert(secondCode && secondCode !== code, 'no second code');
    });
  } finally {
    await browser.close();
  }

  const tokenRequest = (codeVerifier, authCode = code) =>
    get('/auth/realms/erp/protocol/openid-connect/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: 'erp-web',
        client_secret: env.ERP_WEB_CLIENT_SECRET,
        code: authCode,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }),
    });

  await check('Token exchange fails with a wrong PKCE verifier', async () => {
    assert(secondCode, 'no second authorization code to test with');
    // secondCode was issued for verifier2; presenting the first verifier must fail.
    const res = await tokenRequest(verifier, secondCode);
    assert(res.status === 400, `HTTP ${res.status}`);
    const body = await res.json();
    assert(body.error === 'invalid_grant', JSON.stringify(body));
  });

  let accessToken;
  await check('Token exchange succeeds with the right verifier; access token targets erp-api', async () => {
    const res = await tokenRequest(verifier);
    const text = await res.text();
    assert(res.status === 200, `HTTP ${res.status} ${text}`);
    const body = JSON.parse(text);
    accessToken = body.access_token;
    const claims = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url').toString());
    assert(claims.iss === issuer, `iss ${claims.iss}`);
    assert([].concat(claims.aud).includes('erp-api'), `aud ${claims.aud}`);
    assert(claims.sub === userId, `sub ${claims.sub}`);
  });

  await check('API accepts the Keycloak token and resolves the platform administrator', async () => {
    const res = await get('/api/v1/me', { headers: { authorization: `Bearer ${accessToken}` } });
    const text = await res.text();
    assert(res.status === 200, `HTTP ${res.status} ${text}`);
    const me = JSON.parse(text);
    assert(me.user.isPlatformAdmin === true, JSON.stringify(me.user));
  });

  await check('Database backup runs and restores into a scratch database', async () => {
    const once = compose('exec', '-T', 'backup', '/bin/sh', '/erp-backup/backup.sh', 'once');
    assert(/backup ok: erp-/.test(once) && /backup ok: keycloak-/.test(once), once);
    const verify = compose('exec', '-T', 'backup', '/bin/sh', '/erp-backup/backup.sh', 'verify');
    assert(/VERIFIED/.test(verify) && /ledger balanced per company: yes/.test(verify), verify);
  });
}

main()
  .catch((err) => {
    results.push({ name: 'harness', ok: false });
    console.error(err);
  })
  .finally(() => {
    const failed = results.filter((r) => !r.ok).length;
    console.log(`\n${results.length - failed}/${results.length} deployment checks passed`);
    process.exit(failed ? 1 : 0);
  });
