#!/usr/bin/env node
// Smoke test: boots the built API, worker and web server against real local PostgreSQL/Redis,
// then checks health endpoints and renders the web shell in a real browser (Playwright/Chromium)
// in English and Arabic at desktop and phone widths.
//
// Prerequisites: `pnpm build`, `pnpm db:up`, `pnpm db:migrate`, and apps/api/.env (copy .env.example).
// Usage: pnpm test:smoke [--screenshots <dir>]
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const shotsArg = process.argv.indexOf('--screenshots');
const shotsDir = shotsArg > 0 ? resolve(process.argv[shotsArg + 1]) : undefined;

function loadEnvFile(path) {
  const out = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

const apiEnv = { ...loadEnvFile(join(root, 'apps/api/.env')), ...process.env };
const ports = { api: 4000, worker: 4100, web: 3000 };
const children = [];
const results = [];
const exited = new Set();

function start(name, cwd, args, env) {
  const child = spawn(process.execPath, args, {
    cwd: join(root, cwd),
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  child.on('exit', (code) => {
    if (!child.stopping) {
      exited.add(name);
      console.error(`[${name}] exited with ${code}\n${log.slice(-2000)}`);
    }
  });
  children.push(child);
  return child;
}

async function waitFor(url, { status = 200, timeoutMs = 60000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    if (exited.size) throw new Error(`process exited early: ${[...exited].join(', ')}`);
    try {
      const res = await fetch(url, { redirect: 'manual' });
      if (res.status === status) return res;
      last = `HTTP ${res.status}`;
    } catch (err) {
      last = err.cause?.code ?? err.message;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${url} did not return ${status} within ${timeoutMs}ms (last: ${last})`);
}

async function check(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  ✓ ${name}`);
  } catch (err) {
    results.push({ name, ok: false, error: err.message });
    console.log(`  ✗ ${name}\n      ${err.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  start('api', 'apps/api', ['dist/main.js'], {
    ...apiEnv,
    // Production mode requires OIDC settings. The .invalid host is never contacted: the smoke test
    // only calls public endpoints and an unauthenticated request, which is rejected before key lookup.
    OIDC_ISSUER: 'https://issuer.smoke.invalid/realms/erp',
    OIDC_AUDIENCE: 'erp-api',
    OIDC_JWKS_URL: 'https://issuer.smoke.invalid/realms/erp/certs',
    API_PORT: String(ports.api),
    LOG_LEVEL: 'warn',
    NODE_ENV: 'production',
  });
  start('worker', 'apps/worker', ['dist/main.js'], {
    REDIS_QUEUE_URL: apiEnv.REDIS_QUEUE_URL,
    WORKER_HEALTH_PORT: String(ports.worker),
    WORKER_HEARTBEAT_MS: '1000',
    LOG_LEVEL: 'warn',
  });
  const nextBin = createRequire(join(root, 'apps/web-erp/package.json')).resolve('next/dist/bin/next');
  start('web', 'apps/web-erp', [nextBin, 'start', '--port', String(ports.web)], {
    API_INTERNAL_URL: `http://localhost:${ports.api}`,
    // Production mode requires sign-in settings; the .invalid issuer is never contacted because the
    // smoke test does not sign in (the browser end-to-end test does, against a real Keycloak).
    WEB_PUBLIC_URL: `http://localhost:${ports.web}`,
    OIDC_ISSUER: 'https://issuer.smoke.invalid/realms/erp',
    OIDC_CLIENT_SECRET: 'smoke-placeholder',
    WEB_SESSION_SECRET: randomBytes(32).toString('base64url'),
  });

  const api = `http://localhost:${ports.api}/api/v1`;
  const web = `http://localhost:${ports.web}`;

  console.log('Smoke test');
  await check('API liveness 200', async () => {
    const body = await (await waitFor(`${api}/health/live`)).json();
    assert(body.status === 'up', `unexpected body ${JSON.stringify(body)}`);
  });
  await check('API readiness 200 with database, cache and queue up', async () => {
    const body = await (await waitFor(`${api}/health/ready`, { timeoutMs: 20000 })).json();
    const s = body.checks
      .map((c) => `${c.name}:${c.status}`)
      .sort()
      .join(',');
    assert(s === 'cache:up,database:up,queue:up', s);
  });
  await check('API docs disabled in production mode', async () => {
    const res = await fetch(`${api.replace('/v1', '')}/docs`);
    assert(res.status === 404, `expected 404, got ${res.status}`);
  });
  await check('Protected endpoint without a token answers 401 problem+json', async () => {
    const res = await fetch(`${api}/me`);
    assert(res.status === 401, `expected 401, got ${res.status}`);
    assert(res.headers.get('www-authenticate') === 'Bearer', 'missing WWW-Authenticate');
    assert(res.headers.get('content-type')?.includes('application/problem+json'), 'not problem+json');
  });
  await check('Worker liveness and readiness (heartbeat processed)', async () => {
    await waitFor(`http://localhost:${ports.worker}/health/live`);
    const body = await (
      await waitFor(`http://localhost:${ports.worker}/health/ready`, { timeoutMs: 20000 })
    ).json();
    assert(
      body.checks.find((c) => c.name === 'heartbeat')?.detail?.startsWith('last '),
      'no heartbeat recorded',
    );
  });
  await check('Web liveness /healthz', async () => {
    await waitFor(`${web}/healthz`);
  });
  await check('Web / redirects by Accept-Language', async () => {
    const ar = await fetch(`${web}/`, {
      redirect: 'manual',
      headers: { 'accept-language': 'ar-QA,ar;q=0.9' },
    });
    assert(
      [307, 308].includes(ar.status) && ar.headers.get('location')?.endsWith('/ar'),
      `ar -> ${ar.status} ${ar.headers.get('location')}`,
    );
    const en = await fetch(`${web}/`, { redirect: 'manual', headers: { 'accept-language': 'en-US' } });
    assert(en.headers.get('location')?.endsWith('/en'), `en -> ${en.headers.get('location')}`);
  });

  const { chromium } = createRequire(import.meta.url)('playwright');
  const browser = await chromium.launch();
  try {
    for (const [locale, dir, upLabel] of [
      ['en', 'ltr', 'Operational'],
      ['ar', 'rtl', 'يعمل'],
    ]) {
      for (const [label, viewport] of [
        ['desktop', { width: 1280, height: 800 }],
        ['phone', { width: 390, height: 844 }],
      ]) {
        await check(
          `Web /${locale} (${label}) renders ${dir.toUpperCase()} with live dependency status`,
          async () => {
            const page = await browser.newPage({ viewport });
            const errors = [];
            page.on('pageerror', (e) => errors.push(e.message));
            const res = await page.goto(`${web}/${locale}`);
            assert(res?.status() === 200, `HTTP ${res?.status()}`);
            assert((await page.getAttribute('html', 'dir')) === dir, 'wrong dir');
            assert((await page.getAttribute('html', 'lang')) === locale, 'wrong lang');
            for (const name of ['database', 'cache', 'queue']) {
              const text = await page.locator(`[data-check="${name}"]`).innerText();
              assert(text.includes(upLabel), `${name}: ${text}`);
            }
            const signIn = await page.locator('a[href^="/session/login"]').count();
            assert(signIn === 1, 'sign-in link not offered');
            const overflow = await page.evaluate(
              () => document.documentElement.scrollWidth > window.innerWidth,
            );
            assert(!overflow, 'horizontal scroll at this width');
            assert(errors.length === 0, `page errors: ${errors.join('; ')}`);
            if (shotsDir) {
              await mkdir(shotsDir, { recursive: true });
              await page.screenshot({ path: join(shotsDir, `web-${locale}-${label}.png`), fullPage: true });
            }
            await page.close();
          },
        );
      }
    }
  } finally {
    await browser.close();
  }
}

function stopAll() {
  for (const c of children) {
    c.stopping = true;
    c.kill('SIGTERM');
  }
}

main()
  .catch((err) => {
    results.push({ name: 'smoke harness', ok: false, error: err.message });
    console.error(err);
  })
  .finally(() => {
    stopAll();
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} smoke checks passed`);
    setTimeout(() => process.exit(failed.length ? 1 : 0), 500);
  });
