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
