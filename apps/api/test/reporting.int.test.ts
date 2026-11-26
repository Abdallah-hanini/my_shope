import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { api, bootApp, createUser, uid, type TestAuth } from './helpers';

// Executive financial summary against a hand-calculated fixture (docs/KPI_DICTIONARY.md).
// Every expected figure below was computed independently from the journals posted in beforeAll.

let app: INestApplication;
let auth: TestAuth;
let prisma: PrismaClient;
let token: string;
let companyId: string;
const ids: Record<string, string> = {};
const key = () => `rep-${randomUUID()}`;

async function post(body: object) {
  const res = await api(app, token)
    .post(`/companies/${companyId}/journals`, body, { 'Idempotency-Key': key() })
    .expect(201);
  return res.body.id as string;
}
const line = (account: string, debit = '0', credit = '0') => ({ accountId: ids[account], debit, credit });
const summary = (q: string, t = token) =>
  api(app, t).get(`/companies/${companyId}/reports/financial-summary?${q}`);

beforeAll(async () => {
  ({ app, auth, prisma } = await bootApp());
  const admin = await createUser(prisma, { platformAdmin: true });
  token = await auth.sign(admin.sub);
  const c = api(app, token);
  companyId = (
    await c
      .post('/companies', {
        code: `R${uid()}`,
        legalName: 'Reporting fixture',
        baseCurrency: 'QAR',
        timezone: 'Asia/Qatar',
        initialAdminUserId: admin.id,
      })
      .expect(201)
  ).body.id;
  ids.DOH = (
    await c.post(`/companies/${companyId}/branches`, { code: 'DOH', name: 'Doha' }).expect(201)
  ).body.id;
  ids.PRT = (
    await c.post(`/companies/${companyId}/branches`, { code: 'PRT', name: 'Parts' }).expect(201)
  ).body.id;
  const accounts: [string, string, string, string | null][] = [
    ['CASH', '1100', 'asset', 'cash'],
    ['BANK', '1200', 'asset', 'bank'],
    ['CAP', '3100', 'equity', null],
    ['SVC', '4100', 'revenue', null],
    ['PARTS', '4200', 'revenue', null],
    ['COGS', '5000', 'expense', 'cogs'],
    ['RENT', '5100', 'expense', null],
    ['SAL', '5200', 'expense', null],
  ];
  for (const [k, code, type, reportingClass] of accounts) {
    ids[k] = (
      await c
        .post(`/companies/${companyId}/accounts`, { code, name: k, type, isPosting: true, reportingClass })
        .expect(201)
    ).body.id;
  }
  await c
    .post(`/companies/${companyId}/fiscal-periods`, {
      name: '2025-12',
      startDate: '2025-12-01',
      endDate: '2025-12-31',
    })
    .expect(201);
  await c
    .post(`/companies/${companyId}/fiscal-periods`, {
      name: 'FY2026',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
    })
    .expect(201);

  // J1 company level: capital into bank (no P&L effect)
  await post({
    postingDate: '2026-01-10',
    description: 'capital',
    lines: [line('BANK', '50000'), line('CAP', '0', '50000')],
  });
  // J2 DOH: takings → revenue 2000
  await post({
    postingDate: '2026-02-05',
    description: 'takings',
    branchId: ids.DOH,
    lines: [line('CASH', '2000'), line('SVC', '0', '1200'), line('PARTS', '0', '800')],
  });
  // J3 DOH: cost of goods sold 500
  await post({
    postingDate: '2026-02-06',
    description: 'cogs',
    branchId: ids.DOH,
    lines: [line('COGS', '500'), line('BANK', '0', '500')],
  });
  // J4 PRT: parts sale 1000
  await post({
    postingDate: '2026-03-01',
    description: 'sale',
    branchId: ids.PRT,
    lines: [line('CASH', '1000'), line('PARTS', '0', '1000')],
  });
  // J5 company level: rent 4500
  await post({
    postingDate: '2026-03-02',
    description: 'rent',
    lines: [line('RENT', '4500'), line('BANK', '0', '4500')],
  });
  // J6 PRT: salaries 300, then reversed (nets to zero)
  ids.J6 = await post({
    postingDate: '2026-03-10',
    description: 'salary',
    branchId: ids.PRT,
    lines: [line('SAL', '300'), line('CASH', '0', '300')],
  });
  ids.REV = (
    await api(app, token)
      .post(
        `/companies/${companyId}/journals/${ids.J6}/reverse`,
        { postingDate: '2026-03-11', reason: 'wrong period' },
        { 'Idempotency-Key': key() },
      )
      .expect(201)
  ).body.number;
});

afterAll(async () => {
  await prisma.$disconnect();
  await app.close();
});

describe('financial summary (reconciles to the posted ledger)', () => {
  it('company-wide Q1 totals match the hand calculation', async () => {
    const r = (await summary('from=2026-01&to=2026-03').expect(200)).body;
    expect(r).toMatchObject({
      currency: 'QAR',
      from: '2026-01',
      to: '2026-03',
      scope: 'company',
      branchId: null,
    });
    expect(r.totals).toEqual({
      revenue: '3000.00',
      cogs: '500.00',
      grossProfit: '2500.00',
      grossMarginPercent: '83.3',
      operatingExpenses: '4500.00', // rent 4500 + salary 300 − reversal 300
      netProfit: '-2000.00',
      cashAndBank: '48000.00', // bank 45000 + cash 3000
      journalCount: 7,
    });
    expect(new Date(r.asOf).getTime()).toBeGreaterThan(Date.now() - 60_000);
  });

  it('monthly trend fills empty months and sums to the totals', async () => {
    const r = (await summary('from=2026-01&to=2026-03').expect(200)).body;
    expect(r.months).toEqual([
      { month: '2026-01', revenue: '0.00', cogs: '0.00', operatingExpenses: '0.00', netProfit: '0.00' },
      {
        month: '2026-02',
        revenue: '2000.00',
        cogs: '500.00',
        operatingExpenses: '0.00',
        netProfit: '1500.00',
      },
      {
        month: '2026-03',
        revenue: '1000.00',
        cogs: '0.00',
        operatingExpenses: '4500.00',
        netProfit: '-3500.00',
      },
    ]);
  });

  it('branch breakdown includes company-level journals and reconciles to net profit', async () => {
    const r = (await summary('from=2026-01&to=2026-03').expect(200)).body;
    const rows = Object.fromEntries(r.branches.map((b: { code: string | null }) => [b.code ?? 'COMPANY', b]));
    expect(rows.COMPANY).toMatchObject({
      branchId: null,
      revenue: '0.00',
      expenses: '4500.00',
      netProfit: '-4500.00',
    });
    expect(rows.DOH).toMatchObject({ revenue: '2000.00', expenses: '500.00', netProfit: '1500.00' });
    expect(rows.PRT).toMatchObject({ revenue: '1000.00', expenses: '0.00', netProfit: '1000.00' });
    const cents = (v: string) => Math.round(Number(v) * 100);
    const sum = r.branches.reduce((a: number, b: { netProfit: string }) => a + cents(b.netProfit), 0);
    expect(sum).toBe(cents(r.totals.netProfit));
  });

  it('branch filter limits every figure, including cash', async () => {
    const r = (await summary(`from=2026-02&to=2026-02&branchId=${ids.DOH}`).expect(200)).body;
    expect(r.totals).toMatchObject({
      revenue: '2000.00',
      cogs: '500.00',
      grossMarginPercent: '75.0',
      netProfit: '1500.00',
      cashAndBank: '1500.00', // DOH cash 2000 − bank 500
      journalCount: 2,
    });
  });

  it('gross margin is null (not 0%) when a period has no revenue', async () => {
    const r = (await summary('from=2026-04&to=2026-04').expect(200)).body;
    expect(r.totals.revenue).toBe('0.00');
    expect(r.totals.grossMarginPercent).toBeNull();
    expect(r.totals.cashAndBank).toBe('48000.00'); // balance carries forward
  });

  it('flags open periods past their end date and reversals in range', async () => {
    const r = (await summary('from=2026-01&to=2026-03').expect(200)).body;
    const kinds = r.exceptions.map((e: { kind: string; label: string }) => `${e.kind}:${e.label}`);
    expect(kinds).toContain('period_open_after_end:2025-12');
    expect(kinds).toContain(`reversal_in_range:${ids.REV}`);
    expect(kinds.some((k: string) => k.startsWith('no_cash_accounts'))).toBe(false);
  });

  it('rejects invalid ranges', async () => {
    await summary('from=2026-03&to=2026-01').expect(400);
    await summary('from=2024-01&to=2026-03').expect(400);
    await summary('from=2026-1&to=2026-03').expect(400);
    await summary(`from=2026-01&to=2026-03&branchId=${randomUUID()}`).expect(422);
  });
});

describe('financial summary authorization', () => {
  it('branch-limited users see only their branch and cannot widen it', async () => {
    const role = (
      await api(app, token)
        .post(`/companies/${companyId}/roles`, {
          code: 'branch-viewer',
          name: 'Branch viewer',
          permissions: ['reports.financial.read'],
        })
        .expect(201)
    ).body.id;
    const viewer = await createUser(prisma);
    await api(app, token)
      .post(`/companies/${companyId}/role-assignments`, {
        userId: viewer.id,
        roleId: role,
        branchId: ids.PRT,
      })
      .expect(201);
    const t = await auth.sign(viewer.sub);
    const r = (await summary('from=2026-01&to=2026-03', t).expect(200)).body;
    expect(r.scope).toBe('branches');
    expect(r.totals).toMatchObject({ revenue: '1000.00', operatingExpenses: '0.00', netProfit: '1000.00' });
    expect(r.branches.map((b: { code: string }) => b.code)).toEqual(['PRT']);
    await summary(`from=2026-01&to=2026-03&branchId=${ids.DOH}`, t).expect(403);
  });

  it('requires the reporting permission and hides foreign companies', async () => {
    const outsider = await createUser(prisma);
    await summary('from=2026-01&to=2026-03', await auth.sign(outsider.sub)).expect(404);
    const role = (
      await api(app, token)
        .post(`/companies/${companyId}/roles`, {
          code: 'journal-reader',
          name: 'Journal reader',
          permissions: ['accounting.journal.read'],
        })
        .expect(201)
    ).body.id;
    const reader = await createUser(prisma);
    await api(app, token)
      .post(`/companies/${companyId}/role-assignments`, { userId: reader.id, roleId: role })
      .expect(201);
    await summary('from=2026-01&to=2026-03', await auth.sign(reader.sub)).expect(403);
  });

  it('a company without cash or bank accounts is told so instead of showing 0 as fact', async () => {
    const admin = await createUser(prisma, { platformAdmin: true });
    const t = await auth.sign(admin.sub);
    const other = (
      await api(app, t)
        .post('/companies', {
          code: `N${uid()}`,
          legalName: 'No cash',
          baseCurrency: 'QAR',
          timezone: 'Asia/Qatar',
          initialAdminUserId: admin.id,
        })
        .expect(201)
    ).body.id;
    const r = (
      await api(app, t)
        .get(`/companies/${other}/reports/financial-summary?from=2026-01&to=2026-01`)
        .expect(200)
    ).body;
    expect(r.exceptions.map((e: { kind: string }) => e.kind)).toContain('no_cash_accounts');
  });
});

describe('reporting classification rules', () => {
  it('API rejects a class that does not match the account type', async () => {
    await api(app, token)
      .post(`/companies/${companyId}/accounts`, {
        code: '1999',
        name: 'x',
        type: 'asset',
        isPosting: true,
        reportingClass: 'cogs',
      })
      .expect(400);
  });

  it('database rejects it too when the API is bypassed', async () => {
    await expect(
      prisma.$executeRaw`INSERT INTO accounting.account (company_id, code, name, type, is_posting, reporting_class)
        VALUES (${companyId}::uuid, '1998', 'x', 'asset', true, 'cogs')`,
    ).rejects.toThrow(/account_reporting_class_valid/);
  });

  it('existing company-administrator roles received the reporting permission', async () => {
    const roles = await prisma.role.findMany({ where: { code: 'company-admin', isSystem: true } });
    expect(roles.length).toBeGreaterThan(0);
    expect(roles.every((r) => r.permissions.includes('reports.financial.read'))).toBe(true);
  });
});

// Trial balance (WEB-122) and general ledger (WEB-100) on the same fixture. Hand calculation, Q1 2026:
//   CASH  +2000 (J2) +1000 (J4) −300 (J6) +300 (reversal)      = 3000 Dr
//   BANK  +50000 (J1) −500 (J3) −4500 (J5)                     = 45000 Dr
//   CAP −50000, SVC −1200, PARTS −1800 (Cr); COGS 500, RENT 4500 (Dr); SAL +300 −300 = 0
//   period debits = credits = 58600; closing Dr = Cr = 53000; result 3000 − 500 − 4500 = −2000
describe('trial balance and general ledger (WEB-122, WEB-100)', () => {
  const tb = (q: string, t = token) => api(app, t).get(`/companies/${companyId}/reports/trial-balance?${q}`);
  const gl = (q: string, t = token) => api(app, t).get(`/companies/${companyId}/reports/general-ledger?${q}`);
  type TbRow = { account: { code: string; isPosting: boolean }; closing: string; level: number };
  const byCode = (rows: TbRow[]): Record<string, TbRow> =>
    Object.fromEntries(rows.map((r) => [r.account.code, r]));

  beforeAll(async () => {
    const c = api(app, token);
    ids.OVH = (
      await c
        .post(`/companies/${companyId}/accounts`, {
          code: '6000',
          name: 'Overheads',
          type: 'expense',
          isPosting: false,
        })
        .expect(201)
    ).body.id;
    ids.UTIL = (
      await c
        .post(`/companies/${companyId}/accounts`, {
          code: '6100',
          name: 'Utilities',
          type: 'expense',
          isPosting: true,
          parentId: ids.OVH,
        })
        .expect(201)
    ).body.id;
    // J7 in April: does not touch Q1.
    await post({
      postingDate: '2026-04-02',
      description: 'electricity',
      lines: [{ ...line('UTIL', '100'), description: 'April bill' }, line('BANK', '0', '100')],
    });
  });

  it('Q1 matches the hand calculation, balances and reconciles to the dashboard', async () => {
    const r = (await tb('from=2026-01-01&to=2026-03-31').expect(200)).body;
    const rows = byCode(r.rows);
    expect(Object.keys(rows)).toEqual(['1100', '1200', '3100', '4100', '4200', '5000', '5100', '5200']);
    expect(rows['1100']).toMatchObject({
      opening: '0.00',
      periodDebit: '3300.00',
      periodCredit: '300.00',
      closing: '3000.00',
    });
    expect(rows['1200']!.closing).toBe('45000.00');
    expect(rows['3100']!.closing).toBe('-50000.00');
    expect(rows['5200']).toMatchObject({ periodDebit: '300.00', periodCredit: '300.00', closing: '0.00' });
    expect(r.totals).toEqual({
      openingDebit: '0.00',
      openingCredit: '0.00',
      periodDebit: '58600.00',
      periodCredit: '58600.00',
      closingDebit: '53000.00',
      closingCredit: '53000.00',
    });
    expect(r).toMatchObject({ balanced: true, periodResult: '-2000.00', currency: 'QAR', scope: 'company' });
    const dash = (await summary('from=2026-01&to=2026-03').expect(200)).body;
    expect(r.periodResult).toBe(dash.totals.netProfit);
  });

  it('carries closing balances forward as openings and rolls header accounts up', async () => {
    const r = (await tb('from=2026-04-01&to=2026-04-30').expect(200)).body;
    const rows = byCode(r.rows);
    expect(rows['1200']).toMatchObject({ opening: '45000.00', periodCredit: '100.00', closing: '44900.00' });
    expect(rows['6000']).toMatchObject({ level: 0, periodDebit: '100.00', closing: '100.00' });
    expect(rows['6000']!.account.isPosting).toBe(false);
    expect(rows['6100']).toMatchObject({ level: 1, closing: '100.00' });
    expect(r.totals.openingDebit).toBe('53000.00');
    expect(r.totals.periodDebit).toBe('100.00');
    expect(r.balanced).toBe(true);
  });

  it('hides accounts without activity unless asked', async () => {
    const q1 = (await tb('from=2026-01-01&to=2026-03-31').expect(200)).body;
    expect(q1.rows.map((x: { account: { code: string } }) => x.account.code)).not.toContain('6000');
    const all = (await tb('from=2026-01-01&to=2026-03-31&includeZero=true').expect(200)).body;
    expect(byCode(all.rows)['6100']).toMatchObject({ closing: '0.00', level: 1 });
  });

  it('a branch trial balance contains only that branch and still balances', async () => {
    const r = (await tb(`from=2026-01-01&to=2026-03-31&branchId=${ids.DOH}`).expect(200)).body;
    expect(Object.keys(byCode(r.rows))).toEqual(['1100', '1200', '4100', '4200', '5000']);
    expect(r).toMatchObject({ balanced: true, periodResult: '1500.00' });
    expect(r.totals.periodDebit).toBe('2500.00');
  });

  it('general ledger: opening, running balance and closing per line, in date order', async () => {
    const r = (await gl(`accountId=${ids.CASH}&from=2026-01-01&to=2026-03-31`).expect(200)).body;
    expect(r).toMatchObject({
      opening: '0.00',
      periodDebit: '3300.00',
      periodCredit: '300.00',
      closing: '3000.00',
      lineCount: 4,
      nextCursor: null,
    });
    expect(
      r.lines.map((l: { debit: string; credit: string; balance: string }) => [l.debit, l.credit, l.balance]),
    ).toEqual([
      ['2000.00', '0.00', '2000.00'],
      ['1000.00', '0.00', '3000.00'],
      ['0.00', '300.00', '2700.00'],
      ['300.00', '0.00', '3000.00'],
    ]);
    expect(r.lines[0]).toMatchObject({
      postingDate: '2026-02-05',
      description: 'takings',
      sourceType: 'manual',
    });
    expect(r.lines[3]).toMatchObject({ sourceType: 'reversal', journalNumber: ids.REV });
    const bank = (await gl(`accountId=${ids.BANK}&from=2026-02-01&to=2026-04-30`).expect(200)).body;
    expect(bank).toMatchObject({ opening: '50000.00', closing: '44900.00', lineCount: 3 });
    const util = (await gl(`accountId=${ids.UTIL}&from=2026-04-01&to=2026-04-30`).expect(200)).body;
    expect(util.lines[0].description).toBe('April bill'); // line text wins over the journal's
  });

  it('pages keep the running balance continuous', async () => {
    const p1 = (await gl(`accountId=${ids.CASH}&from=2026-01-01&to=2026-03-31&limit=2`).expect(200)).body;
    expect(p1.lines).toHaveLength(2);
    expect(p1.nextCursor).toEqual(expect.any(String));
    const p2 = (
      await gl(`accountId=${ids.CASH}&from=2026-01-01&to=2026-03-31&limit=2&cursor=${p1.nextCursor}`).expect(
        200,
      )
    ).body;
    expect(p2.pageOpening).toBe('3000.00');
    expect(p2.lines.map((l: { balance: string }) => l.balance)).toEqual(['2700.00', '3000.00']);
    expect(p2.nextCursor).toBeNull();
    expect(p2.periodDebit).toBe(p1.periodDebit);
  });

  it('refuses header accounts, unknown accounts, foreign cursors and bad ranges', async () => {
    await gl(`accountId=${ids.OVH}&from=2026-01-01&to=2026-12-31`).expect(422);
    await gl(`accountId=${randomUUID()}&from=2026-01-01&to=2026-12-31`).expect(404);
    await gl(`accountId=${ids.CASH}&from=2026-01-01&to=2026-12-31&cursor=bm9wZQ`).expect(422);
    await tb('from=2026-03-01&to=2026-01-01').expect(400);
    await tb('from=2020-01-01&to=2026-01-01').expect(400);
  });

  it('branch-limited journal readers see their branch ledger only; the trial balance needs the report permission', async () => {
    const role = (
      await api(app, token)
        .post(`/companies/${companyId}/roles`, {
          code: `gl-${uid()}`,
          name: 'GL reader',
          permissions: ['accounting.journal.read'],
        })
        .expect(201)
    ).body.id;
    const reader = await createUser(prisma);
    await api(app, token)
      .post(`/companies/${companyId}/role-assignments`, {
        userId: reader.id,
        roleId: role,
        branchId: ids.PRT,
      })
      .expect(201);
    const t = await auth.sign(reader.sub);
    const r = (await gl(`accountId=${ids.CASH}&from=2026-01-01&to=2026-03-31`, t).expect(200)).body;
    expect(r).toMatchObject({ scope: 'branches', lineCount: 3, closing: '1000.00' });
    await gl(`accountId=${ids.CASH}&from=2026-01-01&to=2026-03-31&branchId=${ids.DOH}`, t).expect(403);
    await tb('from=2026-01-01&to=2026-03-31', t).expect(403);
    const outsider = await createUser(prisma);
    await gl(`accountId=${ids.CASH}&from=2026-01-01&to=2026-03-31`, await auth.sign(outsider.sub)).expect(
      404,
    );
  });
});
