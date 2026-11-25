#!/usr/bin/env node
// Browser end-to-end test of the web ERP against real services:
// dev Keycloak (pnpm auth:up), PostgreSQL + Redis (pnpm db:up, migrated), built API and web.
//   pnpm build && pnpm db:up && pnpm db:migrate && pnpm auth:up && pnpm test:e2e-web [--screenshots <dir>]
// Uses DATABASE_URL / REDIS_* from the environment or apps/api/.env. Creates a uniquely named
// company and Keycloak user each run (synthetic data only).
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { keycloakLogin } from '../deploy/scripts/keycloak-login.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const shotsArg = process.argv.indexOf('--screenshots');
const shots = shotsArg > 0 ? resolve(process.argv[shotsArg + 1]) : undefined;
if (shots) mkdirSync(shots, { recursive: true });

const fileEnv = Object.fromEntries(
  readFileSync(join(root, 'apps/api/.env'), 'utf8')
    .split('\n')
    .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
const env = { ...fileEnv, ...process.env };
const KC = process.env.KEYCLOAK_URL ?? 'http://localhost:8080';
const ISSUER = `${KC}/realms/erp`;
const WEB = 'http://localhost:3000';
const API_PORT = 4000;
const children = [];
const results = [];
const exited = new Set();
let currentPage;
let failureCount = 0;

function start(name, cwd, args, extra) {
  const child = spawn(process.execPath, args, {
    cwd: join(root, cwd),
    env: { ...env, ...extra },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  child.on('exit', (code) => {
    if (!child.stopping) {
      exited.add(name);
      console.error(`[${name}] exited with ${code}\n${log.slice(-3000)}`);
    }
  });
  child.logs = () => log;
  children.push(child);
  return child;
}

async function waitFor(url, status = 200, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (exited.size) throw new Error(`process exited early: ${[...exited].join(', ')}`);
    try {
      const r = await fetch(url, { redirect: 'manual' });
      if (r.status === status) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${url} not ready`);
}

async function check(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  ✓ ${name}`);
  } catch (err) {
    results.push({ name, ok: false });
    console.log(`  ✗ ${name}\n      ${String(err.message).split('\n').slice(0, 4).join('\n      ')}`);
    if (currentPage) {
      console.log(`      at ${currentPage.url()}`);
      if (shots)
        await currentPage
          .screenshot({ path: join(shots, `failure-${++failureCount}.png`), fullPage: true })
          .catch(() => {});
    }
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function kc(...args) {
  const r = spawnSync('docker', ['compose', 'exec', '-T', 'keycloak', ...args], {
    cwd: root,
    encoding: 'utf8',
  });
  if (r.status !== 0) throw new Error(`keycloak exec failed: ${r.stderr}`);
  return `${r.stdout}${r.stderr}`;
}

async function main() {
  const sessionSecret = randomBytes(32).toString('base64url');
  start('api', 'apps/api', ['dist/main.js'], {
    API_PORT: String(API_PORT),
    LOG_LEVEL: process.env.E2E_API_LOG_LEVEL ?? 'warn',
    NODE_ENV: 'development',
    API_CORS_ORIGINS: WEB,
    OIDC_ISSUER: ISSUER,
    OIDC_AUDIENCE: 'erp-api',
    OIDC_JWKS_URL: `${ISSUER}/protocol/openid-connect/certs`,
  });
  const nextBin = createRequire(join(root, 'apps/web-erp/package.json')).resolve('next/dist/bin/next');
  start('web', 'apps/web-erp', [nextBin, 'start', '--port', '3000'], {
    API_INTERNAL_URL: `http://localhost:${API_PORT}`,
    WEB_PUBLIC_URL: WEB,
    OIDC_ISSUER: ISSUER,
    OIDC_CLIENT_ID: 'erp-web',
    OIDC_CLIENT_SECRET: process.env.ERP_WEB_CLIENT_SECRET ?? 'erp_web_local_dev_only',
    WEB_SESSION_SECRET: sessionSecret,
    NODE_ENV: 'production',
  });
  await waitFor(`http://localhost:${API_PORT}/api/v1/health/live`);
  await waitFor(`${WEB}/healthz`);
  await waitFor(`${ISSUER}/.well-known/openid-configuration`);

  // Provision a platform administrator exactly as an operator would.
  const username = `e2e-${Date.now()}`;
  const out = kc(
    'bash',
    '/erp-scripts/bootstrap-admin.sh',
    username,
    `${username}@shop.invalid`,
    'E2E',
    'Owner',
  );
  const userId = out.match(/USER_ID=(\S+)/)?.[1];
  const tempPassword = out.match(/TEMP_PASSWORD=(\S+)/)?.[1];
  assert(userId && tempPassword, out);
  const cli = spawnSync(
    process.execPath,
    [
      'dist/cli/bootstrap-admin.js',
      '--issuer',
      ISSUER,
      '--subject',
      userId,
      '--email',
      `${username}@shop.invalid`,
      '--name',
      'E2E Owner',
    ],
    { cwd: join(root, 'apps/api'), env, encoding: 'utf8' },
  );
  assert(cli.status === 0, cli.stderr);

  const { chromium } = createRequire(join(root, 'package.json'))('playwright');
  const browser = await chromium.launch();
  const context = await browser.newContext({ locale: 'en-GB', viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  currentPage = page;
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  const shot = async (name) => shots && page.screenshot({ path: join(shots, `${name}.png`), fullPage: true });
  let companyId = '';
  let journalId = '';
  const code = `E2E${randomBytes(3).toString('hex').toUpperCase()}`;

  try {
    await check('Protected pages redirect to Keycloak sign-in', async () => {
      await page.goto(`${WEB}/en/c/00000000-0000-4000-8000-000000000000/journals`);
      assert(page.url().startsWith(`${ISSUER}/protocol/openid-connect/auth`), page.url());
      const u = new URL(page.url());
      assert(u.searchParams.get('code_challenge_method') === 'S256', 'PKCE missing');
      assert(
        u.searchParams.get('redirect_uri') === `${WEB}/session/callback`,
        u.searchParams.get('redirect_uri'),
      );
    });

    await check('Sign in from the home page (password change + authenticator enrolment)', async () => {
      await page.goto(`${WEB}/en`);
      await Promise.all([
        page.waitForURL((u) => u.toString().startsWith(KC)),
        page.getByRole('link', { name: 'Sign in' }).first().click(),
      ]);
      const { completed } = await keycloakLogin(page, {
        username,
        password: tempPassword,
        done: (u) => u.startsWith(`${WEB}/en`),
      });
      assert(completed.password && completed.totp, JSON.stringify(completed));
      await page.getByRole('heading', { name: 'Choose a company' }).waitFor();
      assert(await page.getByText('E2E Owner').count(), 'user name not shown');
    });

    await check('Session cookie is httpOnly and not readable by page scripts', async () => {
      const cookies = await context.cookies(WEB);
      const session = cookies.filter((c) => c.name.startsWith('erp_session.'));
      assert(session.length >= 1, 'no session cookie');
      assert(
        session.every((c) => c.httpOnly && c.sameSite === 'Lax'),
        JSON.stringify(session.map((c) => [c.name, c.httpOnly, c.sameSite])),
      );
      const visible = await page.evaluate(() => document.cookie);
      assert(!visible.includes('erp_session'), 'session cookie visible to JavaScript');
      assert(!cookies.some((c) => c.name === 'erp_login'), 'login state cookie left behind');
    });

    await check('Create a company (platform administrator)', async () => {
      await page.getByRole('link', { name: 'New company' }).click();
      await page.getByLabel('Code').fill(code);
      await page.getByLabel('Legal name (English)').fill(`${code} Auto Parts W.L.L.`);
      await page.getByLabel('Legal name (Arabic) (optional)').fill('شركة قطع غيار تجريبية');
      await Promise.all([
        page.waitForURL(/\/en\/c\/[0-9a-f-]{36}$/),
        page.getByRole('button', { name: 'Create company' }).click(),
      ]);
      companyId = page.url().split('/c/')[1];
      await page.getByRole('heading', { name: `${code} Auto Parts W.L.L.` }).waitFor();
    });

    const base = () => `${WEB}/en/c/${companyId}`;
    const addAccount = async (accCode, name, type, kind, parentLabel) => {
      await page.getByLabel('Code').fill(accCode);
      await page.getByLabel('Name', { exact: true }).fill(name);
      await page.getByLabel('Type').selectOption(type);
      await page.getByLabel('Kind').selectOption(kind);
      if (parentLabel)
        await page.getByLabel('Parent account (optional)').selectOption({ label: parentLabel });
      await Promise.all([
        page.waitForLoadState('networkidle'),
        page.getByRole('button', { name: 'Create' }).click(),
      ]);
    };

    await check('Build a chart of accounts with a header and posting accounts', async () => {
      await page.goto(`${base()}/accounts`);
      await page.getByText('No accounts yet').waitFor();
      await addAccount('1', 'Assets', 'asset', 'header');
      await page.getByRole('cell', { name: 'Assets' }).waitFor();
      await addAccount('1100', 'Cash', 'asset', 'posting', '1 — Assets');
      await page.getByRole('cell', { name: 'Cash' }).waitFor();
      await addAccount('3100', 'Owner capital', 'equity', 'posting');
      await page.getByRole('cell', { name: 'Owner capital' }).waitFor();
      await shot('accounts-en');
    });

    await check('Duplicate account code shows the server error next to the form', async () => {
      await addAccount('1100', 'Cash again', 'asset', 'posting');
      // Scoped to forms: Next.js adds an empty route announcer with role=alert to every page.
      const alert = page.locator('form [role=alert]');
      await alert.waitFor();
      assert(/already exists/.test(await alert.innerText()), await alert.innerText());
    });

    await check('Create fiscal periods', async () => {
      await page.goto(`${base()}/periods`);
      for (const [name, s, e] of [
        ['2026-11', '2026-11-01', '2026-11-30'],
        ['2026-12', '2026-12-01', '2026-12-31'],
      ]) {
        await page.getByLabel('Name').fill(name);
        await page.getByLabel('Start date').fill(s);
        await page.getByLabel('End date').fill(e);
        await Promise.all([
          page.waitForLoadState('networkidle'),
          page.getByRole('button', { name: 'Create' }).click(),
        ]);
        await page.getByRole('heading', { name }).waitFor();
      }
    });

    const fillJournal = async (debit, credit, date) => {
      await page.goto(`${base()}/journals/new`);
      if (date) await page.getByLabel('Posting date').fill(date);
      await page.getByLabel('Description', { exact: true }).fill('Owner capital injection (synthetic)');
      await page.locator('#je-acc-1').selectOption({ label: '1100 — Cash' });
      await page.locator('#je-dr-1').fill(debit);
      await page.locator('#je-acc-2').selectOption({ label: '3100 — Owner capital' });
      await page.locator('#je-cr-2').fill(credit);
    };

    await check(
      'Journal form shows exact running totals and the server rejects an unbalanced entry',
      async () => {
        await fillJournal('100.10', '100.00');
        const status = await page.locator('[aria-live=polite]').innerText();
        assert(/Not balanced/.test(status) && /0\.10/.test(status), status);
        await page.getByRole('button', { name: 'Post journal' }).click();
        // Scoped to forms: Next.js adds an empty route announcer with role=alert to every page.
        const alert = page.locator('form [role=alert]');
        await alert.waitFor();
        assert(/not balanced/i.test(await alert.innerText()), await alert.innerText());
        assert(page.url().endsWith('/journals/new'), 'navigated away after an error');
      },
    );

    await check('Post a balanced journal and open its detail', async () => {
      await page.locator('#je-cr-2').fill('100.10');
      assert(/Balanced/.test(await page.locator('[aria-live=polite]').innerText()), 'not balanced');
      await shot('journal-new-en');
      await Promise.all([
        page.waitForURL(/\/journals\/[0-9a-f-]{36}$/),
        page.getByRole('button', { name: 'Post journal' }).click(),
      ]);
      journalId = page.url().split('/journals/')[1];
      await page.getByRole('heading', { name: /JV-2026-000001/ }).waitFor();
      const totals = await page.locator('tfoot').innerText();
      assert(/100\.10/.test(totals), totals);
      await shot('journal-detail-en');
    });

    await check('Reverse the journal; the original links to its reversal', async () => {
      await page.getByLabel('Reason').fill('Entered against the wrong account');
      // Server-action redirects navigate client-side; wait for the new journal instead of a page load.
      await page.getByRole('button', { name: 'Reverse journal' }).click();
      await page.getByRole('heading', { name: /JV-2026-000002/ }).waitFor();
      await page.getByText('Reversal of', { exact: true }).waitFor();
      await page.goto(`${base()}/journals/${journalId}`);
      await page.getByText('Reversed by').waitFor();
      assert(
        (await page.getByRole('button', { name: 'Reverse journal' }).count()) === 0,
        'reverse offered twice',
      );
    });

    await check('Journal list shows both entries', async () => {
      await page.goto(`${base()}/journals`);
      await page.getByRole('link', { name: 'JV-2026-000001' }).waitFor();
      await page.getByRole('link', { name: 'JV-2026-000002' }).waitFor();
    });

    await check('Close a period; posting into it is then refused with a clear message', async () => {
      await page.goto(`${base()}/periods`);
      const item = page.locator('li', { has: page.getByRole('heading', { name: '2026-11' }) });
      await item.getByText('Close period').first().click();
      await item.getByLabel('Reason').fill('Month end');
      await Promise.all([
        page.waitForLoadState('networkidle'),
        item.getByRole('button', { name: 'Close period' }).click(),
      ]);
      await page
        .locator('li', { has: page.getByRole('heading', { name: '2026-11' }) })
        .getByText('Closed', { exact: true })
        .waitFor();
      await fillJournal('5.00', '5.00', '2026-11-20');
      await page.getByRole('button', { name: 'Post journal' }).click();
      // Scoped to forms: Next.js adds an empty route announcer with role=alert to every page.
      const alert = page.locator('form [role=alert]');
      await alert.waitFor();
      assert(/closed/i.test(await alert.innerText()), await alert.innerText());
    });

    await check('Branches: add and list', async () => {
      await page.goto(`${base()}/branches`);
      await page.getByLabel('Code').fill('DOH');
      await page.getByLabel('Name', { exact: true }).fill('Doha workshop');
      await page.getByLabel('Arabic name (optional)').fill('ورشة الدوحة');
      await Promise.all([
        page.waitForLoadState('networkidle'),
        page.getByRole('button', { name: 'Create' }).click(),
      ]);
      await page.getByRole('cell', { name: 'Doha workshop' }).waitFor();
    });

    await check('Audit trail lists the actions with the reason', async () => {
      await page.goto(`${base()}/audit`);
      for (const action of [
        'accounting.journal.post',
        'accounting.journal.reverse',
        'accounting.period.close',
        'org.company.create',
      ]) {
        await page.getByText(action, { exact: true }).first().waitFor();
      }
      await page.getByRole('cell', { name: 'Month end' }).waitFor();
    });

    await check(
      'Arabic pages are right-to-left with translated navigation, and fit a phone screen',
      async () => {
        await page.setViewportSize({ width: 390, height: 844 });
        for (const path of [
          'journals',
          `journals/${journalId}`,
          'journals/new',
          'accounts',
          'periods',
          'audit',
        ]) {
          await page.goto(`${WEB}/ar/c/${companyId}/${path}`);
          assert((await page.getAttribute('html', 'dir')) === 'rtl', `${path}: not rtl`);
          await page.getByRole('navigation', { name: 'التنقل الرئيسي' }).waitFor();
          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth - window.innerWidth,
          );
          assert(overflow <= 0, `${path}: horizontal scroll of ${overflow}px`);
          if (path === 'journals/new') await shot('journal-new-ar-phone');
          if (path === `journals/${journalId}`) await shot('journal-detail-ar-phone');
        }
        await page.getByRole('link', { name: 'القيود' }).waitFor();
        await page.setViewportSize({ width: 1280, height: 900 });
      },
    );

    await check('Language switch keeps the current page', async () => {
      await page.goto(`${WEB}/ar/c/${companyId}/journals`);
      await Promise.all([
        page.waitForURL(`${WEB}/en/c/${companyId}/journals`),
        page.getByRole('link', { name: 'English' }).click(),
      ]);
    });

    await check('Sign out ends the ERP and the Keycloak session', async () => {
      await page.goto(`${WEB}/en/c/${companyId}`);
      await Promise.all([
        page.waitForURL((u) => u.toString().startsWith(WEB) && !u.toString().includes('/c/')),
        page.getByRole('button', { name: 'Sign out' }).click(),
      ]);
      await page.waitForLoadState('networkidle');
      const cookies = await context.cookies(WEB);
      assert(!cookies.some((c) => c.name.startsWith('erp_session.')), 'session cookie still present');
      await page.goto(`${WEB}/en/c/${companyId}/journals`);
      // A fresh Keycloak login form (not a silent SSO redirect back) proves the IdP session ended.
      await page.waitForSelector('#username', { timeout: 15000 });
    });

    await check('Sign-out cannot be triggered cross-site (Origin check)', async () => {
      const r = await fetch(`${WEB}/session/logout`, {
        method: 'POST',
        headers: { origin: 'https://evil.test' },
        redirect: 'manual',
      });
      assert(r.status === 403, `HTTP ${r.status}`);
    });

    await check('Open redirect via returnTo is refused', async () => {
      const r = await fetch(`${WEB}/session/login?returnTo=${encodeURIComponent('//evil.test/x')}`, {
        redirect: 'manual',
      });
      assert(r.status === 303, `HTTP ${r.status}`);
      // The return path is stored sealed; the only redirect goes to Keycloak.
      assert(r.headers.get('location').startsWith(`${ISSUER}/`), r.headers.get('location'));
    });

    await check('No uncaught page errors', async () => {
      assert(pageErrors.length === 0, pageErrors.join('; '));
    });
  } finally {
    await browser.close();
  }
}

main()
  .catch((err) => {
    results.push({ name: 'harness', ok: false });
    console.error(err);
  })
  .finally(() => {
    for (const c of children) {
      c.stopping = true;
      c.kill('SIGTERM');
    }
    const failed = results.filter((r) => !r.ok);
    if (process.env.E2E_LOG_DIR) {
      mkdirSync(process.env.E2E_LOG_DIR, { recursive: true });
      for (const c of children)
        writeFileSync(
          join(process.env.E2E_LOG_DIR, `${c.spawnargs.includes('start') ? 'web' : 'api'}.log`),
          c.logs(),
        );
    }
    if (failed.length)
      for (const c of children)
        console.error(`--- ${c.spawnargs.slice(-3).join(' ')} log tail ---\n${c.logs().slice(-1500)}`);
    console.log(`\n${results.length - failed.length}/${results.length} web end-to-end checks passed`);
    setTimeout(() => process.exit(failed.length ? 1 : 0), 500);
  });
