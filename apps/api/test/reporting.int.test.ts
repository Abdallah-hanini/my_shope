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
