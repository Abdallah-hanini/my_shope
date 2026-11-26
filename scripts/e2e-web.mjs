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
    // Staff onboarding uses the least-privilege erp-api-admin service client (pnpm auth:up).
    KEYCLOAK_ADMIN_BASE_URL: KC,
    KEYCLOAK_REALM: 'erp',
    KEYCLOAK_ADMIN_CLIENT_SECRET: process.env.ERP_API_ADMIN_CLIENT_SECRET ?? 'erp_api_admin_local_dev_only',
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
      // The signed-in user is named in the profile button's accessible label.
      await page.getByRole('button', { name: 'Profile and settings: E2E Owner' }).waitFor();
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
      // The company opens on the executive dashboard (WEB-001).
      await page.getByRole('heading', { name: 'Executive overview' }).waitFor();
      await page.getByRole('navigation', { name: 'Main navigation' }).waitFor();
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

    await check('Executive dashboard shows ledger-based KPIs and exceptions', async () => {
      await page.goto(`${base()}?from=2026-11&to=2026-11`);
      await page.getByRole('heading', { name: 'Executive overview' }).waitFor();
      const kpis = await page.getByRole('region', { name: 'Executive overview' }).innerText();
      // November holds a capital injection (cash vs equity) and its reversal: no P&L effect.
      assert(/Revenue[\s\S]*0\.00/.test(kpis), kpis);
      assert(/Journals posted\s*2/.test(kpis), kpis);
      const exceptions = await page.locator('#exceptions-title').locator('xpath=../..').innerText();
      assert(/No account is marked as cash or bank/.test(exceptions), exceptions);
      assert(/Journal reversed in this period/.test(exceptions), exceptions);
      await page.getByText('Show data as a table').click();
      await page.getByRole('rowheader', { name: '2026-11' }).waitFor();
      await shot('dashboard-en');
    });

    const nov = 'from=2026-11-01&to=2026-11-30';
    await check('Trial balance: chart order, header roll-up, balanced totals, period result', async () => {
      await page.goto(`${base()}/trial-balance?${nov}`);
      await page.getByRole('heading', { name: 'Trial balance' }).waitFor();
      await page.getByText('Balanced: total debits equal total credits').waitFor();
      const rows = await page.locator('tbody tr').allInnerTexts();
      // Header "1 Assets" first, then its child "1100 Cash", then "3100 Owner capital".
      assert(
        /^1\s*Assets/.test(rows[0]) && /1100\s*Cash/.test(rows[1]) && /3100/.test(rows[2]),
        rows.join(' | '),
      );
      assert(/100\.10[\s\S]*100\.10/.test(rows[0]), `header roll-up: ${rows[0]}`);
      const foot = await page.locator('tfoot').innerText();
      assert((foot.match(/200\.20/g) ?? []).length === 2, foot);
      assert((await page.getByTestId('period-result').innerText()).includes('0.00'), 'period result');
      await shot('trial-balance-en');
      // Print → Save as PDF: no menu, header, filters or export controls; the report stays.
      await page.emulateMedia({ media: 'print' });
      assert(
        !(await page.getByRole('navigation', { name: 'Main navigation' }).first().isVisible()),
        'sidebar printed',
      );
      assert(!(await page.getByRole('form', { name: 'Report filters' }).isVisible()), 'filters printed');
      assert(
        !(await page.getByRole('button', { name: 'Export', exact: true }).isVisible()),
        'export control printed',
      );
      assert(await page.getByRole('table').isVisible(), 'report not printed');
      assert(await page.locator('main > p.print\\:block').isVisible(), 'company name not printed');
      if (shots)
        await page.pdf({ path: join(shots, 'trial-balance-en.pdf'), format: 'A4', printBackground: true });
      await page.emulateMedia({ media: 'screen' });
    });

    await check('Drill down: trial balance → general ledger → journal', async () => {
      await Promise.all([
        page.waitForURL(/\/ledger\?account=[0-9a-f-]{36}&from=2026-11-01&to=2026-11-30$/),
        page.getByRole('link', { name: 'Open the general ledger for 1100 Cash' }).click(),
      ]);
      await page.getByRole('heading', { name: '1100 — Cash' }).waitFor();
      // After in-app navigation the header must follow the URL (layouts are not re-rendered).
      const crumb = page.getByRole('navigation', { name: 'Breadcrumb' }).locator('[aria-current=page]');
      assert((await crumb.innerText()) === 'General ledger', `breadcrumb: ${await crumb.innerText()}`);
      const ar = await page.getByRole('link', { name: 'العربية' }).getAttribute('href');
      assert(/^\/ar\/c\/[0-9a-f-]{36}\/ledger\?account=/.test(ar), `language switch: ${ar}`);
      const lines = await page.locator('tbody tr').allInnerTexts();
      assert(/Opening balance[\s\S]*0\.00/.test(lines[0]), lines[0]);
      assert(/JV-2026-000001[\s\S]*100\.10[\s\S]*100\.10\s*Dr/.test(lines[1]), lines[1]);
      assert(/JV-2026-000002[\s\S]*100\.10[\s\S]*0\.00$/.test(lines[2].trim()), lines[2]);
      assert(/Closing balance\s*0\.00/.test(await page.locator('tfoot').innerText()), 'closing');
      await shot('general-ledger-en');
      await Promise.all([
        page.waitForURL(/\/journals\/[0-9a-f-]{36}$/),
        page.getByRole('link', { name: 'JV-2026-000001' }).click(),
      ]);
      await page.getByRole('heading', { name: /JV-2026-000001/ }).waitFor();
    });

    await check(
      'General ledger without an account asks for one; header accounts are not offered',
      async () => {
        await page.goto(`${base()}/ledger`);
        await page.getByText('Choose an account, or open one from the trial balance.').waitFor();
        const options = await page.locator('#f-account option').allInnerTexts();
        assert(!options.some((o) => /^1 — /.test(o)), `header offered: ${options}`);
        await page.locator('#f-account').selectOption({ label: '3100 — Owner capital' });
        await page.getByLabel('From').fill('2026-11-01');
        await page.getByLabel('To').fill('2026-11-30');
        await Promise.all([page.waitForURL(/account=/), page.getByRole('button', { name: 'Apply' }).click()]);
        await page.getByRole('heading', { name: '3100 — Owner capital' }).waitFor();
        assert(/100\.10\s*Cr/.test(await page.locator('tbody').innerText()), 'credit balance not shown');
      },
    );

    await check(
      'Global search: "/" focuses the header box; results grouped by type link to records',
      async () => {
        await page.goto(base());
        await page.locator('main').click({ position: { x: 5, y: 5 } });
        await page.keyboard.press('/');
        assert(
          await page.locator('#global-search').evaluate((el) => el === document.activeElement),
          'not focused',
        );
        await page.keyboard.type('cash');
        await Promise.all([page.waitForURL(/\/search\?q=cash$/), page.keyboard.press('Enter')]);
        await page.getByRole('heading', { name: 'Results for “cash”' }).waitFor();
        const crumb = page.getByRole('navigation', { name: 'Breadcrumb' }).locator('[aria-current=page]');
        assert((await crumb.innerText()) === 'Search', `breadcrumb: ${await crumb.innerText()}`);
        const accounts = page.locator('#results-account-title').locator('xpath=../..');
        const link = accounts.getByRole('link', { name: /1100\s*Cash/ });
        assert(
          /\/ledger\?account=/.test(await link.getAttribute('href')),
          'account does not open its ledger',
        );
        await shot('search-en');
        await page.locator('#search-q').fill('JV-2026-000002');
        await Promise.all([
          page.waitForURL(/q=JV-2026-000002/),
          page.getByRole('button', { name: 'Search', exact: true }).click(),
        ]);
        const journals = page.locator('#results-journal-title').locator('xpath=../..');
        await journals.getByText('Reversal', { exact: true }).waitFor();
        await Promise.all([
          page.waitForURL(/\/journals\/[0-9a-f-]{36}$/),
          journals.getByRole('link').first().click(),
        ]);
        await page.getByRole('heading', { name: /JV-2026-000002/ }).waitFor();
      },
    );

    await check(
      'Global search tolerates Arabic spelling variants and says when nothing matches',
      async () => {
        // The branch is named "ورشة الدوحة"; searching with ه instead of ة still finds it.
        await page.goto(`${base()}/search?q=${encodeURIComponent('ورشه')}`);
        await page
          .locator('#results-branch-title')
          .locator('xpath=../..')
          .getByText('DOH', { exact: true })
          .waitFor();
        await page.goto(`${base()}/search?q=zzqx`);
        await page.getByText('Nothing matches “zzqx”.').waitFor();
      },
    );

    const waitReady = async () => {
      // The export centre refreshes itself until the newest export is ready.
      const row = page.locator('tbody tr').first();
      await row.getByText('Ready', { exact: true }).waitFor({ timeout: 30000 });
      return row;
    };
    await check(
      'Export centre: Excel export of the trial balance from its page, downloaded and equal to the screen',
      async () => {
        await page.goto(`${base()}/trial-balance?${nov}`);
        await page.locator('#x-format').selectOption('xlsx');
        await Promise.all([
          page.waitForURL(/\/exports\?new=[0-9a-f-]{36}$/),
          page.getByRole('button', { name: 'Export', exact: true }).click(),
        ]);
        const row = await waitReady();
        const [download] = await Promise.all([
          page.waitForEvent('download'),
          row.getByRole('link', { name: /^Download/ }).click(),
        ]);
        assert(
          /^trial-balance_.+_2026-11-01_2026-11-30\.xlsx$/.test(download.suggestedFilename()),
          download.suggestedFilename(),
        );
        const file = await download.path();
        const ExcelJS = createRequire(join(root, 'apps/api/package.json'))('exceljs');
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.readFile(file);
        const ws = wb.getWorksheet('Trial balance');
        const last = ws.getRow(ws.rowCount);
        assert(
          last.getCell(2).value === 'Totals' &&
            last.getCell(7).value === 200.2 &&
            last.getCell(8).value === 200.2,
          JSON.stringify(last.values),
        );
        assert(wb.getWorksheet('About').getCell('B1').value === 'Trial balance', 'About sheet');
        await shot('export-centre-en');
      },
    );

    await check('Export centre: Arabic CSV of journal lines; the download is audited', async () => {
      await page.goto(`${base()}/exports`);
      await page.locator('#e-kind').selectOption('journal_lines');
      await page.locator('#e-from').fill('2026-11-01');
      await page.locator('#e-to').fill('2026-11-30');
      await page.locator('#e-format').selectOption('csv');
      await page.locator('#e-lang').selectOption('ar');
      await Promise.all([
        page.waitForURL(/\/exports\?new=/),
        page.getByRole('button', { name: 'Request export' }).click(),
      ]);
      const row = await waitReady();
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        row.getByRole('link', { name: /^Download/ }).click(),
      ]);
      const { readFileSync } = await import('node:fs');
      const buf = readFileSync(await download.path());
      assert(buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf, 'no UTF-8 BOM');
      const text = buf.subarray(3).toString('utf8');
      assert(text.startsWith('التاريخ,القيد,السطر'), text.slice(0, 60));
      assert(/JV-2026-000001,1,/.test(text) && /الإجماليات,,200\.20,200\.20/.test(text), text);
      await page.goto(`${base()}/audit`);
      await page.getByText('export.download', { exact: true }).first().waitFor();
    });

    const bell = () => page.getByTestId('notification-bell');
    const bellLabel = async (pattern) => {
      // Events are delivered by the dispatcher within seconds; the bell refreshes on navigation.
      for (let i = 0; i < 20; i++) {
        await page.goto(`${base()}/journals`);
        const label = (await bell().getAttribute('aria-label')) ?? '';
        if (pattern.test(label)) return label;
        await page.waitForTimeout(500);
      }
      throw new Error(`bell label never matched ${pattern}: ${await bell().getAttribute('aria-label')}`);
    };
    await check(
      'Notifications: finished exports reach the bell and inbox; open and mark all as read',
      async () => {
        await bellLabel(/^Notifications: 2 unread$/);
        await bell().click();
        await page.waitForURL(`${base()}/notifications`);
        const crumb = page.getByRole('navigation', { name: 'Breadcrumb' }).locator('[aria-current=page]');
        assert((await crumb.innerText()) === 'Notifications', 'breadcrumb');
        const items = page.locator('li[data-notification=export_ready]');
        assert((await items.count()) === 2, `items: ${await items.count()}`);
        assert(
          /Your export “(Journal lines|Trial balance)” is ready to download \(.+\.(csv|xlsx)\)\./.test(
            await items.first().innerText(),
          ),
          await items.first().innerText(),
        );
        await shot('notifications-en');
        await Promise.all([
          page.waitForURL(`${base()}/exports`),
          items.first().getByRole('button', { name: 'Open' }).click(),
        ]);
        await bellLabel(/^Notifications: 1 unread$/);
        await page.goto(`${base()}/notifications`);
        await page.getByRole('button', { name: 'Mark all as read' }).click();
        await page.waitForFunction(
          () =>
            document.querySelector('[data-testid=notification-bell]')?.getAttribute('aria-label') ===
            'Notifications',
        );
        await page.getByRole('link', { name: 'Unread' }).click();
        await page.getByText('Nothing unread.').waitFor();
      },
    );

    let jobUrl = '';
    await check(
      'Workshop: customer and vehicle, check-in with tasks, authorise, assign, work, send to QC',
      async () => {
        await page.goto(`${base()}/customers`);
        await page.locator('#cust-name').fill('Khalid Al-Marri');
        await page.locator('#cust-nameAr').fill('خالد المري');
        await page.locator('#cust-phone').fill('+974 5555 0101');
        await Promise.all([
          page.waitForURL(/\/customers\/[0-9a-f-]{36}$/),
          page.getByRole('button', { name: 'New customer' }).click(),
        ]);
        await page.locator('#veh-plate').fill('123  456');
        await page.locator('#veh-make').fill('Toyota');
        await page.locator('#veh-model').fill('Land Cruiser');
        await page.locator('#veh-year').fill('2019');
        await Promise.all([
          page.waitForURL(/\/vehicles\/[0-9a-f-]{36}$/),
          page.getByRole('button', { name: 'Add vehicle' }).click(),
        ]);
        await page.getByRole('heading', { name: '123 456' }).waitFor(); // plate normalised by the server
        await Promise.all([
          page.waitForURL(/\/jobs\/new\?vehicle=/),
          page.getByRole('link', { name: 'Check in (new job card)' }).click(),
        ]);
        await page.locator('#job-odometer').fill('120500');
        await page.locator('#job-complaint').fill('Brakes squeal when cold');
        await page.locator('input[name=taskDescription]').first().fill('Replace front brake pads');
        await page.locator('input[name=taskHours]').first().fill('1.5');
        await page.getByRole('button', { name: 'Add task' }).click();
        await page.locator('input[name=taskDescription]').nth(1).fill('Road test');
        await page.locator('input[name=taskHours]').nth(1).fill('0.5');
        await Promise.all([
          page.waitForURL(/\/jobs\/[0-9a-f-]{36}$/),
          page.getByRole('button', { name: 'Open job card' }).click(),
        ]);
        jobUrl = page.url();
        await page.getByRole('heading', { name: 'JC-2026-000001' }).waitFor();
        await page.locator('main').getByText('Draft', { exact: true }).first().waitFor();
        assert((await page.locator('tfoot').innerText()).includes('2.00'), 'estimated total');
        const step = async (name) => {
          await page.getByRole('button', { name, exact: true }).first().click();
          await page.waitForLoadState('networkidle');
        };
        // Check-in inspection (required before authorisation) and a photo.
        const insp = page.getByRole('form', { name: 'Check-in inspection' });
        await insp.getByRole('radiogroup', { name: 'Body and paint' }).getByLabel('Needs attention').check();
        await insp.getByLabel('Note: Body and paint').fill('Scratch on rear bumper');
        await insp.getByRole('button', { name: 'Save inspection' }).click();
        await page.getByText('Recorded by: E2E Owner').waitFor();
        const sharp = createRequire(join(root, 'apps/api/package.json'))('sharp');
        const png = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#cc4422' } })
          .png()
          .toBuffer();
        const photos = page.getByRole('form', { name: 'Add photos' });
        await photos
          .getByLabel(/^Photos \(up to 5/)
          .setInputFiles({ name: 'rear.png', mimeType: 'image/png', buffer: png });
        await photos.getByLabel('Area').selectOption('rear');
        await photos.getByLabel(/^Caption/).fill('Scratch on bumper');
        await photos.getByRole('button', { name: 'Add photos' }).click();
        const img = page.getByRole('img', { name: 'Rear: Scratch on bumper' });
        await img.waitFor();
        await page.waitForFunction(() => {
          const el = document.querySelector('li[data-photo=rear] img');
          return el instanceof HTMLImageElement && el.complete && el.naturalWidth === 320;
        });
        await step('Record authorisation');
        await page.locator('main').getByText('Approved', { exact: true }).first().waitFor();
        // After authorisation the inspection is read-only evidence and photos cannot be removed.
        assert(
          (await page.getByRole('form', { name: 'Check-in inspection' }).count()) === 0,
          'inspection still editable',
        );
        assert(
          /Needs attention\s*Scratch on rear bumper/.test(
            await page.locator('[data-inspection=body]').innerText(),
          ),
          'inspection summary',
        );
        assert(
          (await page.locator('li[data-photo=rear]').getByRole('button', { name: 'Remove' }).count()) === 0,
          'remove offered',
        );
        await page.getByRole('form', { name: 'Add photos' }).waitFor(); // adding is still possible
        for (const n of [1, 2]) {
          await page.getByLabel(`Technician ${n}`).selectOption({ label: 'E2E Owner' });
          await page
            .getByRole('form', { name: `Assign ${n}` })
            .getByRole('button', { name: 'Assign' })
            .click();
          await page.waitForLoadState('networkidle');
          // Wait for the server's confirmation (a timeline entry) before the next step.
          await page
            .locator('#timeline-title')
            .locator('xpath=../..')
            .getByText('Technician assigned')
            .nth(n - 1)
            .waitFor();
        }
        await page.locator('main').getByText('Assigned', { exact: true }).first().waitFor();
        await step('Start work');
        for (const n of [1, 2]) {
          await page
            .getByRole('form', { name: `Mark done ${n}` })
            .getByRole('button', { name: 'Mark done' })
            .click();
          await page.locator(`tr[data-task="${n}"]`).getByText('Done', { exact: true }).waitFor();
        }
        await step('Send to quality check');
        await page.locator('main').getByText('Quality check', { exact: true }).first().waitFor();
        // Segregation of duties: the person who did the work is not offered the inspection.
        assert(
          (await page.getByRole('heading', { name: 'Quality check', level: 2 }).count()) === 0,
          'QC offered to the technician',
        );
        await page.getByText('Waiting for the quality check by an inspector').waitFor();
        const timeline = await page.locator('#timeline-title').locator('xpath=../..').innerText();
        assert(
          /Job card opened[\s\S]*Approved[\s\S]*In progress[\s\S]*Task done[\s\S]*Quality check/.test(
            timeline,
          ),
          timeline,
        );
        await shot('job-card-en');
      },
    );

    await check('Workshop: the board shows the job under Quality check; plate search finds it', async () => {
      await page.goto(`${base()}/jobs`);
      const col = page
        .getByRole('listitem')
        .filter({ has: page.getByRole('heading', { name: 'Quality check' }) });
      await col.locator('a[data-job="JC-2026-000001"]').waitFor();
      await shot('job-board-en');
      await page.goto(`${base()}/search?q=123456`);
      await page.locator('#results-job-title').locator('xpath=../..').getByText('JC-2026-000001').waitFor();
      await page.locator('#results-vehicle-title').locator('xpath=../..').getByText('123 456').waitFor();
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
          `trial-balance?${nov}`,
          'ledger',
          'search?q=cash',
          'exports',
          'notifications',
          'jobs',
          'vehicles',
          'customers',
          'jobs/new',
        ]) {
          await page.goto(`${WEB}/ar/c/${companyId}/${path}`);
          assert((await page.getAttribute('html', 'dir')) === 'rtl', `${path}: not rtl`);
          // On phones the sidebar becomes a drawer behind the menu button.
          await page.getByRole('button', { name: 'فتح القائمة' }).waitFor();
          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth - window.innerWidth,
          );
          assert(overflow <= 0, `${path}: horizontal scroll of ${overflow}px`);
          if (path === 'journals/new') await shot('journal-new-ar-phone');
          if (path === `journals/${journalId}`) await shot('journal-detail-ar-phone');
          if (path.startsWith('trial-balance')) await shot('trial-balance-ar-phone');
        }
        await page.getByRole('button', { name: 'فتح القائمة' }).click();
        const drawer = page.getByRole('dialog');
        await drawer.getByRole('navigation', { name: 'التنقل الرئيسي' }).waitFor();
        await drawer.getByRole('link', { name: 'القيود' }).waitFor();
        await page.keyboard.press('Escape');
        await page.setViewportSize({ width: 1280, height: 900 });
      },
    );

    const staffUser = `staff-${randomBytes(3).toString('hex')}`;
    let staffPassword = '';
    let staffProfile = '';
    await check('Create a custom role with grouped permissions; it appears in the matrix', async () => {
      await page.goto(`${base()}/roles`);
      const form = page.locator('#new-role-title').locator('xpath=../..');
      await form.getByLabel('Code').fill('JOURNAL_VIEWER');
      await form.getByLabel('Name', { exact: true }).fill('Journal viewer');
      for (const p of ['accounting.journal.read', 'accounting.account.read'])
        await form.locator(`input[name=permissions][value="${p}"]`).check();
      await Promise.all([
        page.waitForURL(/\/roles\/[0-9a-f-]{36}$/),
        form.getByRole('button', { name: 'New role' }).click(),
      ]);
      await page.getByRole('heading', { name: 'Journal viewer' }).waitFor();
      await page.goto(`${base()}/permissions`);
      await page.getByRole('columnheader', { name: 'Journal viewer' }).waitFor();
      const row = page.getByRole('row', { name: /View journals/ });
      assert((await row.getByLabel('Granted').count()) >= 2, 'matrix does not show the grant');
      await shot('permission-matrix-en');
    });

    await check('System roles are read-only', async () => {
      await page.goto(`${base()}/roles`);
      await page.getByRole('link', { name: 'Company administrator' }).click();
      await page.getByText('System roles cannot be changed or deleted.').waitFor();
      assert(await page.locator('#role-name').isDisabled(), 'system role name is editable');
      assert((await page.getByRole('button', { name: 'Save changes' }).count()) === 0, 'save offered');
    });

    await check('Add a staff member: the temporary password is shown once', async () => {
      await page.goto(`${base()}/users`);
      await page.getByLabel('First name').fill('Sara');
      await page.getByLabel('Last name').fill('Cashier');
      await page.getByLabel('Username').fill(staffUser);
      await page.getByLabel('Email').fill(`${staffUser}@shop.invalid`);
      await page.getByLabel('Role').selectOption({ label: 'Journal viewer' });
      await page.getByRole('button', { name: 'Add staff member' }).click();
      const secret = page.getByTestId('temporary-password');
      await secret.waitFor();
      staffPassword = (await secret.innerText()).trim();
      assert(/^[A-Za-z0-9_-]{16}$/.test(staffPassword), 'unexpected temporary password format');
      await page
        .getByRole('cell', { name: /Journal viewer/ })
        .first()
        .waitFor();
      await shot('users-en');
      staffProfile = await page.getByRole('link', { name: 'Open profile' }).getAttribute('href');
      // Reloading does not show the password again.
      await page.reload();
      assert((await page.getByTestId('temporary-password').count()) === 0, 'password shown again');
    });

    await check('Duplicate username is refused with a clear message', async () => {
      await page.getByLabel('First name').fill('Other');
      await page.getByLabel('Last name').fill('Person');
      await page.getByLabel('Username').fill(staffUser);
      await page.getByLabel('Email').fill(`other-${staffUser}@shop.invalid`);
      await page.getByLabel('Role').selectOption({ label: 'Journal viewer' });
      await page.getByRole('button', { name: 'Add staff member' }).click();
      const alert = page.locator('form [role=alert]');
      await alert.waitFor();
      assert((await alert.innerText()).includes('already exists'), await alert.innerText());
    });

    const staffContext = await browser.newContext({
      locale: 'en-GB',
      viewport: { width: 1280, height: 900 },
    });
    const staffPage = await staffContext.newPage();
    staffPage.on('pageerror', (e) => pageErrors.push(e.message));
    await check('The new staff member signs in and sees only what the role allows', async () => {
      await staffPage.goto(`${base()}/journals`);
      ({ newPassword: staffPassword } = await keycloakLogin(staffPage, {
        username: staffUser,
        password: staffPassword,
        done: (u) => u.startsWith(`${WEB}/en/c/${companyId}/journals`),
      }));
      if (shots) await staffPage.screenshot({ path: join(shots, 'staff-journals-en.png'), fullPage: true });
      const nav = staffPage.getByRole('navigation', { name: 'Main navigation' });
      await nav.getByRole('link', { name: 'Journals' }).waitFor();
      assert((await nav.getByRole('link', { name: 'Users' }).count()) === 0, 'Users link shown');
      assert((await nav.getByRole('link', { name: 'Branches' }).count()) === 0, 'Branches link shown');
      await nav.getByRole('link', { name: 'General ledger' }).waitFor();
      // Search respects the role: branches and people are not searchable for this staff member.
      await staffPage.goto(`${base()}/search?q=Doha`);
      await staffPage.getByText('Nothing matches “Doha”.').waitFor();
      // Export centre offers only the kinds this role may export, and nobody else's files.
      await staffPage.goto(`${base()}/exports`);
      const kinds = await staffPage.locator('#e-kind option').allInnerTexts();
      assert(kinds.join('|') === 'General ledger|Journal lines', `kinds: ${kinds}`);
      await staffPage.getByText('You have not requested any exports yet.').waitFor();
      assert(
        (await nav.getByRole('link', { name: 'Trial balance' }).count()) === 0,
        'Trial balance link shown',
      );
      await staffPage.goto(`${base()}/users`);
      await staffPage.getByText('You do not have permission for this.').waitFor();
    });

    await check('Profile: give and remove a role; own account cannot be changed', async () => {
      await page.goto(`${WEB}${staffProfile}`);
      await page.getByRole('heading', { name: 'Sara Cashier' }).waitFor();
      const access = page.locator('#access-title').locator('xpath=../..');
      await access.getByLabel('Role').selectOption({ label: 'Company administrator' });
      await access.getByRole('button', { name: 'Give a role' }).click();
      await access.getByText('Company administrator').first().waitFor();
      const item = access.locator('li', { hasText: 'Company administrator' });
      await item.getByRole('button', { name: 'Remove' }).click();
      await item.waitFor({ state: 'detached' });
      await shot('user-profile-en');
      // The staff member is told, in their inbox, that a role was given and removed.
      for (let i = 0; i < 20; i++) {
        await staffPage.goto(`${base()}/notifications`);
        if ((await staffPage.locator('li[data-notification]').count()) >= 2) break;
        await staffPage.waitForTimeout(500);
      }
      const staffInbox = await staffPage.locator('li[data-notification]').allInnerTexts();
      assert(
        staffInbox.some((x) =>
          x.includes('E2E Owner gave you the role “Company administrator” (All branches).'),
        ),
        staffInbox.join(' | '),
      );
      assert(
        staffInbox.some((x) => x.includes('E2E Owner removed your role “Company administrator”.')),
        staffInbox.join(' | '),
      );
      await page.goto(`${base()}/users`);
      await page.getByRole('link', { name: 'E2E Owner' }).click();
      await page.getByText('To change your own password or authenticator').waitFor();
    });

    await check(
      'Deactivate a staff member: access stops at once and the account cannot sign in',
      async () => {
        await page.goto(`${WEB}${staffProfile}`);
        const account = page.locator('#account-title').locator('xpath=../..');
        await account.getByLabel('Reason').fill('Left the shop');
        await account.getByRole('button', { name: 'Deactivate' }).click();
        await page.getByText('Deactivated', { exact: true }).first().waitFor();
        await staffPage.goto(`${base()}/journals`);
        await staffPage.getByText('You do not have permission for this.').waitFor();
        const fresh = await browser.newContext();
        const p2 = await fresh.newPage();
        await p2.goto(`${base()}/journals`);
        await p2.fill('#username', staffUser);
        // The correct (changed) password: Keycloak refuses because the account is disabled.
        await p2.fill('#password', staffPassword);
        await p2.click('#kc-login');
        await p2
          .getByText(/disabled/i)
          .first()
          .waitFor();
        assert(!p2.url().startsWith(WEB), 'disabled account was signed in');
        await fresh.close();
        await page.goto(`${base()}/audit`);
        await page.getByText('Left the shop').waitFor();
      },
    );
    await staffContext.close();

    await check('Language switch keeps the current page', async () => {
      await page.goto(`${WEB}/ar/c/${companyId}/journals`);
      await Promise.all([
        page.waitForURL(`${WEB}/en/c/${companyId}/journals`),
        page.getByRole('link', { name: 'English' }).click(),
      ]);
    });

    await check('Sign out ends the ERP and the Keycloak session', async () => {
      await page.goto(`${WEB}/en/c/${companyId}`);
      await page.getByRole('button', { name: /^Profile and settings/ }).click();
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
