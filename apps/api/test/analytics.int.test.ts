import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { INSPECTION_ITEMS } from '@erp/validation';
import { randomUUID } from 'node:crypto';
import { localTime } from '../src/workshop/scheduling';
import { api, bootApp, createUser, uid, type TestAuth } from './helpers';

// RPT R2a: sales, operations, customers and stock-movement analytics. Expected figures are worked
// out by hand from the fixture (see the comments), including a credit note, an issued part and a
// part in stock that was never used.

let app: INestApplication;
let auth: TestAuth;
let prisma: PrismaClient;
let companyId: string;
let today: string;
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};
const base = () => `/companies/${companyId}`;
const TZ = 'Asia/Qatar';
const a = (t: string) => api(app, tok[t]);
const range = () => `from=${today}&to=${today}`;

async function person(name: string, permissions: string[]) {
  const role = (
    await a('admin')
      .post(`${base()}/roles`, { code: `r-${uid()}`, name, permissions })
      .expect(201)
  ).body.id;
  const u = await createUser(prisma);
  await a('admin')
    .post(`${base()}/role-assignments`, { userId: u.id, roleId: role, branchId: ids.DOH })
    .expect(201);
  ids[name] = u.id;
  tok[name] = await auth.sign(u.sub);
}

/** A job taken to "ready" with an approved quote; `withPart` reserves and issues 3 × OIL first. */
async function readyJob(hours: string, withPart: boolean) {
  let j = (
    await a('admin')
      .post(`${base()}/jobs`, {
        branchId: ids.DOH,
        vehicleId: ids.vehicle,
        complaint: 'Service',
        odometerIn: 10,
        fuelLevel: 'half',
        tasks: [{ description: `Service ${hours} h`, estimatedHours: hours }],
      })
      .expect(201)
  ).body;
  const step = async (t: string, path: string, body: object = {}) =>
    (j = (
      await a(t)
        .post(`${base()}/jobs/${j.id}/${path}`, { version: j.version, ...body })
        .expect(200)
    ).body);
  await step('admin', 'inspection', { items: INSPECTION_ITEMS.map((i) => ({ key: i.key, status: 'ok' })) });
  await step('admin', 'authorize', { authorizedByName: 'Noor', authorizedVia: 'in_person' });
  await step('admin', `tasks/${j.tasks[0].id}/assign`, { technicianId: ids.tech });
  await step('tech', 'start');
  if (withPart) {
    const jp = (
      await a('admin').post(`${base()}/jobs/${j.id}/parts`, { partId: ids.oil, quantity: '3' }).expect(201)
    ).body.parts[0].id;
    await a('admin').post(`${base()}/job-parts/${jp}/issue`, { idempotencyKey: randomUUID() }).expect(200);
    j = (await a('admin').get(`${base()}/jobs/${j.id}`).expect(200)).body;
  }
  await step('tech', `tasks/${j.tasks[0].id}/complete`);
  await step('tech', 'submit-qc');
  await step('qc', 'qc', { result: 'pass' });
  let q = (await a('admin').post(`${base()}/jobs/${j.id}/quotes`).expect(201)).body.quotes[0];
  q = (await a('admin').post(`${base()}/quotes/${q.id}/issue`, { version: q.version }).expect(200)).body
    .quotes[0];
  await a('admin')
    .post(`${base()}/quotes/${q.id}/decision`, {
      version: q.version,
      decision: 'approve',
      authorizedByName: 'Noor',
      authorizedVia: 'phone',
    })
    .expect(200);
  const inv = (await a('admin').post(`${base()}/jobs/${j.id}/invoices`, { quoteId: q.id }).expect(201)).body
    .documents[0];
  return { jobId: j.id as string, invoice: inv as { id: string; total: string } };
}

beforeAll(async () => {
  ({ app, auth, prisma } = await bootApp());
  const admin = await createUser(prisma, { platformAdmin: true });
  tok.admin = await auth.sign(admin.sub);
  companyId = (
    await api(app, tok.admin)
      .post('/companies', {
        code: `N${uid()}`,
        legalName: 'Analytics fixture',
        baseCurrency: 'QAR',
        timezone: TZ,
        initialAdminUserId: admin.id,
      })
      .expect(201)
  ).body.id;
  today = localTime(new Date(), TZ).date;
  ids.DOH = (await a('admin').post(`${base()}/branches`, { code: 'DOH', name: 'DOH' }).expect(201)).body.id;
  await person('tech', ['workshop.job.read', 'workshop.job.work']);
  await person('qc', ['workshop.job.read', 'workshop.job.qc']);
  for (const [k, code, type, reportingClass] of [
    ['cash', '1100', 'asset', 'cash'],
    ['ar', '1200', 'asset', 'receivable'],
    ['inv', '1400', 'asset', 'inventory'],
    ['grni', '2200', 'liability', undefined],
    ['rev', '4000', 'revenue', undefined],
    ['parts', '4100', 'revenue', undefined],
    ['cogs', '5000', 'expense', 'cogs'],
  ] as const)
    ids[k] = (
      await a('admin')
        .post(`${base()}/accounts`, { code, name: `A${code}`, type, isPosting: true, reportingClass })
        .expect(201)
    ).body.id;
  await a('admin')
    .post(`${base()}/fiscal-periods`, {
      name: 'FY',
      startDate: `${today.slice(0, 4)}-01-01`,
      endDate: `${today.slice(0, 4)}-12-31`,
    })
    .expect(201);
  await a('admin')
    .put(`${base()}/posting-settings`, {
      version: 0,
      labourRevenueAccountId: ids.rev,
      receivableAccountId: ids.ar,
      cashAccountId: ids.cash,
      cardAccountId: null,
      bankAccountId: null,
      inventoryAccountId: ids.inv,
      goodsReceivedAccountId: ids.grni,
      cogsAccountId: ids.cogs,
      partsRevenueAccountId: ids.parts,
    })
    .expect(200);
  await a('admin')
    .post(`${base()}/branches/${ids.DOH}/labour-rates`, { rate: '100', effectiveFrom: today })
    .expect(201);
  const receive = async (part: string, quantity: string, unitCost: string) =>
    a('admin')
      .post(`${base()}/parts/${part}/receipts`, {
        branchId: ids.DOH,
        quantity,
        unitCost,
        reference: 'DN',
        idempotencyKey: randomUUID(),
      })
      .expect(201);
  ids.oil = (
    await a('admin').post(`${base()}/parts`, { sku: 'OIL', name: 'Engine oil', unit: 'litre' }).expect(201)
  ).body.id;
  ids.pad = (
    await a('admin').post(`${base()}/parts`, { sku: 'PAD', name: 'Brake pads', unit: 'set' }).expect(201)
  ).body.id;
  const oil = (await a('admin').get(`${base()}/parts/${ids.oil}`).expect(200)).body;
  await a('admin')
    .put(`${base()}/parts/${ids.oil}/price`, { version: oil.version, salePrice: '10' })
    .expect(200);
  await receive(ids.oil!, '20', '4'); // 80.00
  await receive(ids.pad!, '2', '50'); // 100.00, never used
  const c = (
    await a('admin').post(`${base()}/customers`, { name: 'Noor', phone: '+97455551212' }).expect(201)
  ).body.id;
  await a('admin').post(`${base()}/customers`, { name: 'Sami', phone: '+97455551313' }).expect(201);
  ids.vehicle = (
    await a('admin')
      .post(`${base()}/vehicles`, {
        customerId: c,
        plate: `AN ${uid().slice(0, 4)}`,
        make: 'Kia',
        model: 'Rio',
      })
      .expect(201)
  ).body.id;
  // Job 1: 1.5 h × 100 + 3 × OIL at 10 = 180.00 (issued at cost 3 × 4 = 12.00); paid and delivered.
  const j1 = await readyJob('1.5', true);
  expect(j1.invoice.total).toBe('180.00');
  await a('admin')
    .post(`${base()}/invoices/${j1.invoice.id}/payments`, {
      method: 'cash',
      amount: '180',
      idempotencyKey: randomUUID(),
    })
    .expect(201);
  const jb = (await a('admin').get(`${base()}/jobs/${j1.jobId}`).expect(200)).body;
  await a('admin')
    .post(`${base()}/jobs/${j1.jobId}/deliver`, {
      version: jb.version,
      deliveredToName: 'Noor',
      odometerOut: 20,
    })
    .expect(200);
  // Job 2: 1 h = 100.00, invoiced then cancelled by a credit note; still open (ready).
  const j2 = await readyJob('1', false);
  await a('admin')
    .post(`${base()}/invoices/${j2.invoice.id}/credit-note`, { reason: 'Entered by mistake' })
    .expect(201);
});

afterAll(async () => {
  await prisma.$disconnect();
  await app.close();
});

describe('sales', () => {
  it('invoices less credit notes; labour and parts revenue from the postings; top items; matches ledger revenue', async () => {
    const r = (await a('admin').get(`${base()}/reports/sales?${range()}`).expect(200)).body;
    expect(r).toMatchObject({
      invoices: 2,
      creditNotes: 1,
      sales: '180.00', // 180 + 100 − 100
      labourRevenue: '150.00',
      partsRevenue: '30.00',
      partsSharePct: '16.7',
      discounts: '0.00',
      tax: '0.00',
      averageInvoice: '180.00', // 180 ÷ (2 invoices − 1 credit note)
      ledgerRevenue: '180.00',
      otherRevenue: '0.00',
      byBranch: [{ branchCode: 'DOH', invoices: 2, sales: '180.00' }],
      byMonth: [{ month: today.slice(0, 7), sales: '180.00' }],
    });
    expect(r.topParts).toEqual([{ description: 'OIL Engine oil', quantity: '3.000', amount: '30.00' }]);
    expect(r.topServices).toEqual([{ description: 'Service 1.5 h', quantity: '1.50', amount: '150.00' }]);
  });
  it('needs the financial reports permission', async () => {
    await a('tech').get(`${base()}/reports/sales?${range()}`).expect(403);
    await a('tech').get(`${base()}/reports/customers?${range()}`).expect(403);
    await a('admin').get(`${base()}/reports/sales?from=${today}&to=2020-01-01`).expect(400);
  });
});

describe('operations', () => {
  it('opened, delivered, first-time right, open now; readable with workshop access', async () => {
    const r = (await a('tech').get(`${base()}/reports/operations?${range()}`).expect(200)).body;
    expect(r).toMatchObject({
      opened: 2,
      cancelled: 0,
      delivered: 1,
      firstTimeRightPct: '100.0',
      openNow: 1,
      overdueNow: 0,
      openByStatus: [{ status: 'ready', count: 1, overdue: 0 }],
      byBranch: [{ branchCode: 'DOH', opened: 2, delivered: 1 }],
    });
    expect(Number(r.averageHoursToDeliver)).toBeGreaterThanOrEqual(0);
    expect(r.medianHoursToDeliver).toBe(r.averageHoursToDeliver); // one delivered job
  });
});

describe('customers', () => {
  it('total, new, active, returning and top customers', async () => {
    const r = (await a('admin').get(`${base()}/reports/customers?${range()}`).expect(200)).body;
    expect(r).toMatchObject({
      totalCustomers: 2,
      newCustomers: 2,
      activeCustomers: 1,
      returningCustomers: 0,
      returningPct: '0.0',
      topCustomers: [
        { name: 'Noor', invoices: 2, sales: '180.00', lastInvoiceDate: today, returning: false },
      ],
    });
  });
});

describe('stock movement', () => {
  it('per part flow, turnover, classes, reconciled to the inventory account', async () => {
    const r = (await a('admin').get(`${base()}/reports/stock-movement?${range()}`).expect(200)).body;
    // OIL: 20 received, 3 issued at 4.00 → closing 17 at 68.00; PAD: 2 at 100.00, never issued.
    expect(r).toMatchObject({
      openingValue: '0.00',
      closingValue: '168.00',
      issuedValue: '12.00',
      turnover: '0.14', // 12 ÷ ((0 + 168) ÷ 2)
      ledgerInventory: '168.00',
      reconciled: true,
      counts: { fast: 1, slow: 0, dead: 1 },
    });
    expect(
      r.parts.map(
        (p: {
          sku: string;
          issuedQty: string;
          closingQty: string;
          turnover: string | null;
          class: string;
        }) => [p.sku, p.issuedQty, p.closingQty, p.turnover, p.class],
      ),
    ).toEqual([
      ['OIL', '3.000', '17.000', '0.35', 'fast'], // 12 ÷ ((0 + 68) ÷ 2)
      ['PAD', '0.000', '2.000', '0.00', 'dead'],
    ]);
    expect(r.parts[0]).toMatchObject({
      receivedQty: '20.000',
      issuedValue: '12.00',
      closingValue: '68.00',
      lastIssueDate: today,
    });
    await a('qc').get(`${base()}/reports/stock-movement?${range()}`).expect(403);
  });
});

// ── R3a planning: reorder points, low stock, targets, alerts ─────────────────

describe('reorder points and low stock', () => {
  beforeAll(async () => {
    ids.WAK = (await a('admin').post(`${base()}/branches`, { code: 'WAK', name: 'WAK' }).expect(201)).body.id;
    await person('stockDoh', ['inventory.read', 'inventory.manage']); // DOH only
    // Job 3 in progress reserves 2 × PAD (on hand 2): PAD available 0.
    let j = (
      await a('admin')
        .post(`${base()}/jobs`, {
          branchId: ids.DOH,
          vehicleId: ids.vehicle,
          complaint: 'Brakes',
          odometerIn: 30,
          fuelLevel: 'half',
          tasks: [{ description: 'Brakes', estimatedHours: '1' }],
        })
        .expect(201)
    ).body;
    const step = async (t: string, path: string, body: object = {}) =>
      (j = (
        await a(t)
          .post(`${base()}/jobs/${j.id}/${path}`, { version: j.version, ...body })
          .expect(200)
      ).body);
    await step('admin', 'inspection', { items: INSPECTION_ITEMS.map((i) => ({ key: i.key, status: 'ok' })) });
    await step('admin', 'authorize', { authorizedByName: 'Noor', authorizedVia: 'in_person' });
    await step('admin', `tasks/${j.tasks[0].id}/assign`, { technicianId: ids.tech });
    await step('tech', 'start');
    await a('admin').post(`${base()}/jobs/${j.id}/parts`, { partId: ids.pad, quantity: '2' }).expect(201);
  });

  it('lists parts at or below their point with available = on hand − reserved and a suggested order', async () => {
    const empty = (await a('admin').get(`${base()}/reports/low-stock`).expect(200)).body;
    expect(empty).toMatchObject({ levelsSet: 0, outCount: 0, lowCount: 0, lines: [] });
    // OIL: on hand 20 − 3 issued = 17, point 17 → low; suggested max(24, 17 − 17) = 24 × 4.00 = 96.00.
    const oil = await a('stockDoh')
      .put(`${base()}/parts/${ids.oil}/reorder-levels/${ids.DOH}`, {
        minQuantity: '17',
        reorderQuantity: '24',
      })
      .expect(200);
    expect(oil.body).toMatchObject({ minQuantity: '17.000', reorderQuantity: '24.000', version: 1 });
    // PAD: on hand 2, reserved 2 → available 0 → out; suggested max(4, 1 − 0) = 4 × 50.00 = 200.00.
    await a('admin')
      .put(`${base()}/parts/${ids.pad}/reorder-levels/${ids.DOH}`, { minQuantity: '1', reorderQuantity: '4' })
      .expect(200);
    const r = (await a('admin').get(`${base()}/reports/low-stock`).expect(200)).body;
    expect(r).toMatchObject({ levelsSet: 2, outCount: 1, lowCount: 1, suggestedValue: '296.00' });
    expect(r.lines.map((l: { sku: string; status: string }) => [l.sku, l.status])).toEqual([
      ['PAD', 'out'],
      ['OIL', 'low'],
    ]);
    expect(r.lines[0]).toMatchObject({
      onHand: '2.000',
      reserved: '2.000',
      available: '0.000',
      suggested: '4.000',
      suggestedValue: '200.00',
    });
    expect(r.lines[1]).toMatchObject({ available: '17.000', suggested: '24.000', suggestedValue: '96.00' });
    // The part page shows the point per branch.
    const part = (await a('admin').get(`${base()}/parts/${ids.oil}`).expect(200)).body;
    expect(part.branches.find((b: { branchCode: string }) => b.branchCode === 'DOH')).toMatchObject({
      minQuantity: '17.000',
      reorderVersion: 1,
      canSetReorder: true,
    });
  });

  it('changes need the current version; branch scope and permissions are enforced', async () => {
    const url = `${base()}/parts/${ids.oil}/reorder-levels`;
    await a('admin').put(`${url}/${ids.DOH}`, { minQuantity: '5', reorderQuantity: '24' }).expect(409);
    await a('admin')
      .put(`${url}/${ids.DOH}`, { minQuantity: '5', reorderQuantity: '24', version: 9 })
      .expect(409);
    await a('admin')
      .put(`${url}/${ids.DOH}`, { minQuantity: '16', reorderQuantity: '24', version: 1 })
      .expect(200);
    await a('stockDoh').put(`${url}/${ids.WAK}`, { minQuantity: '1', reorderQuantity: '1' }).expect(403);
    await a('tech').put(`${url}/${ids.DOH}`, { minQuantity: '1', reorderQuantity: '1' }).expect(403);
    await a('tech').get(`${base()}/reports/low-stock`).expect(403);
    await a('admin')
      .put(`${url}/${ids.DOH}`, { minQuantity: '-1', reorderQuantity: '1', version: 2 })
      .expect(400);
    await a('admin')
      .put(`${url}/${ids.DOH}`, { minQuantity: '1', reorderQuantity: '0', version: 2 })
      .expect(400);
    // 16 < 17 available: OIL is no longer low.
    const r = (await a('stockDoh').get(`${base()}/reports/low-stock?branchId=${ids.DOH}`).expect(200)).body;
    expect(r.lines.map((l: { sku: string }) => l.sku)).toEqual(['PAD']);
    await a('stockDoh').get(`${base()}/reports/low-stock?branchId=${ids.WAK}`).expect(403);
    const audit = await prisma.auditEvent.count({
      where: { companyId, action: 'inventory.reorder_level.set' },
    });
    expect(audit).toBe(3);
  });

  it('removing a point takes the part off the list', async () => {
    await a('admin').delete(`${base()}/parts/${ids.oil}/reorder-levels/${ids.DOH}`).expect(204);
    await a('admin').delete(`${base()}/parts/${ids.oil}/reorder-levels/${ids.DOH}`).expect(404);
    const r = (await a('admin').get(`${base()}/reports/low-stock`).expect(200)).body;
    expect(r.levelsSet).toBe(1);
  });
});

describe('sales targets', () => {
  const month = () => today.slice(0, 7);
  beforeAll(async () => {
    await person('targetsDoh', ['reports.financial.read', 'reports.targets.manage']); // DOH only
  });

  it('company target: actual is the sales report figure, achievement and pace for this month', async () => {
    const t = (await a('admin').put(`${base()}/sales-targets`, { month: month(), amount: '360' }).expect(200))
      .body;
    expect(t).toMatchObject({ month: month(), branchId: null, amount: '360.00', version: 1 });
    const r = (
      await a('admin')
        .get(`${base()}/reports/targets?year=${today.slice(0, 4)}`)
        .expect(200)
    ).body;
    const m = r.months.find((x: { month: string }) => x.month === month());
    expect(m).toEqual({ month: month(), target: '360.00', actual: '180.00', achievementPct: '50.0' });
    expect(r.months).toHaveLength(12);
    expect(r).toMatchObject({ targetTotal: '360.00', actualOfTargeted: '180.00', canManage: true });
    const [y, mo, day] = today.split('-').map(Number) as [number, number, number];
    const days = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    const expected = (Math.round((360 * day * 100) / days) / 100).toFixed(2);
    expect(r.pace).toEqual({
      month: month(),
      day,
      days,
      target: '360.00',
      expected,
      actual: '180.00',
      behind: 180 < Number(expected),
    });
  });

  it('one target per month and branch; versioned changes; branch scope; validation', async () => {
    await a('admin').put(`${base()}/sales-targets`, { month: month(), amount: '400' }).expect(409);
    await a('admin')
      .put(`${base()}/sales-targets`, { month: month(), amount: '1000000', version: 1 })
      .expect(200);
    await a('admin').put(`${base()}/sales-targets`, { month: '2026-13', amount: '1' }).expect(400);
    await a('admin')
      .put(`${base()}/sales-targets`, { month: month(), amount: '0', branchId: ids.DOH })
      .expect(400);
    // Branch-limited: own branch yes, company target no, reading needs a branch.
    const dohT = await a('targetsDoh')
      .put(`${base()}/sales-targets`, { month: month(), amount: '200', branchId: ids.DOH })
      .expect(200);
    await a('targetsDoh').put(`${base()}/sales-targets`, { month: month(), amount: '200' }).expect(403);
    await a('targetsDoh')
      .put(`${base()}/sales-targets`, { month: month(), amount: '200', branchId: ids.WAK })
      .expect(403);
    await a('targetsDoh')
      .get(`${base()}/reports/targets?year=${today.slice(0, 4)}`)
      .expect(422);
    const r = (
      await a('targetsDoh')
        .get(`${base()}/reports/targets?year=${today.slice(0, 4)}&branchId=${ids.DOH}`)
        .expect(200)
    ).body;
    expect(r.months.find((x: { month: string }) => x.month === month())).toMatchObject({
      target: '200.00',
      actual: '180.00',
      achievementPct: '90.0',
    });
    expect(r.targets.map((x: { branchCode: string | null }) => x.branchCode)).toEqual(['DOH']);
    await a('tech').put(`${base()}/sales-targets`, { month: month(), amount: '1' }).expect(403);
    await a('tech').get(`${base()}/reports/targets?year=2026`).expect(403);
    // Remove: the company target is not visible to a branch-limited manager.
    const company = (
      await a('admin')
        .get(`${base()}/reports/targets?year=${today.slice(0, 4)}`)
        .expect(200)
    ).body.targets.find((x: { branchId: string | null }) => x.branchId === null);
    await a('targetsDoh').delete(`${base()}/sales-targets/${company.id}`).expect(404);
    await a('targetsDoh').delete(`${base()}/sales-targets/${dohT.body.id}`).expect(204);
  });
});

describe('alerts', () => {
  it('each person sees only the alerts their permissions explain', async () => {
    const admin = (await a('admin').get(`${base()}/alerts`).expect(200)).body;
    const keys = admin.alerts.map((x: { key: string }) => x.key);
    // PAD out of stock (danger first); the company target of 1 000 000 is far ahead of 180.00.
    expect(keys[0]).toBe('stock_out');
    expect(keys).toContain('sales_behind_target');
    expect(keys).not.toContain('stock_low');
    expect(keys).not.toContain('receivables_overdue'); // the only invoice is paid
    expect(keys).not.toContain('receivables_unreconciled');
    const behind = admin.alerts.find((x: { key: string }) => x.key === 'sales_behind_target');
    expect(behind).toMatchObject({ amount: '180.00', href: 'reports/targets' });
    const stockOnly = (await a('stockDoh').get(`${base()}/alerts`).expect(200)).body;
    expect(stockOnly.alerts.map((x: { key: string }) => x.key)).toEqual(['stock_out']);
    expect((await a('tech').get(`${base()}/alerts`).expect(200)).body.alerts).toEqual([]);
    const outsider = await createUser(prisma);
    await api(app, await auth.sign(outsider.sub))
      .get(`${base()}/alerts`)
      .expect(404);
  });
});
