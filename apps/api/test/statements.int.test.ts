import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { INSPECTION_ITEMS } from '@erp/validation';
import { randomUUID } from 'node:crypto';
import { localTime } from '../src/workshop/scheduling';
import { api, bootApp, createUser, uid, type TestAuth } from './helpers';

// RPT R1: profit and loss with the previous period, balance sheet, receivables and payables aging.
// Expected figures are worked out by hand from the fixture below (not from the code under test),
// and each report is checked against its reconciliation (ledger control accounts, A = L + E).

let app: INestApplication;
let auth: TestAuth;
let prisma: PrismaClient;
let companyId: string;
let today: string;
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};
const base = () => `/companies/${companyId}`;
const TZ = 'Asia/Qatar';

async function person(name: string, permissions: string[], branch: string | null) {
  const role = (
    await api(app, tok.admin)
      .post(`${base()}/roles`, { code: `r-${uid()}`, name, permissions })
      .expect(201)
  ).body.id;
  const u = await createUser(prisma);
  await api(app, tok.admin)
    .post(`${base()}/role-assignments`, { userId: u.id, roleId: role, branchId: branch })
    .expect(201);
  ids[name] = u.id;
  tok[name] = await auth.sign(u.sub);
}
const a = (t: string) => api(app, tok[t]);
const journal = (date: string, branch: string | null, dr: string, cr: string, amount: string) =>
  a('admin')
    .post(
      `${base()}/journals`,
      {
        postingDate: date,
        description: `fixture ${dr}/${cr}`,
        ...(branch ? { branchId: ids[branch] } : {}),
        lines: [
          { accountId: ids[dr], debit: amount, credit: '0' },
          { accountId: ids[cr], debit: '0', credit: amount },
        ],
      },
      { 'Idempotency-Key': randomUUID() },
    )
    .expect(201);
const daysAgo = (n: number) => {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

beforeAll(async () => {
  ({ app, auth, prisma } = await bootApp());
  const admin = await createUser(prisma, { platformAdmin: true });
  tok.admin = await auth.sign(admin.sub);
  companyId = (
    await api(app, tok.admin)
      .post('/companies', {
        code: `R${uid()}`,
        legalName: 'Statements fixture',
        baseCurrency: 'QAR',
        timezone: TZ,
        initialAdminUserId: admin.id,
      })
      .expect(201)
  ).body.id;
  today = localTime(new Date(), TZ).date;
  for (const code of ['DOH', 'WAK'])
    ids[code] = (await a('admin').post(`${base()}/branches`, { code, name: code }).expect(201)).body.id;
  for (const [k, code, type, reportingClass] of [
    ['cash', '1100', 'asset', 'cash'],
    ['ar', '1200', 'asset', 'receivable'],
    ['inv', '1400', 'asset', 'inventory'],
    ['ap', '2100', 'liability', 'payable'],
    ['grni', '2200', 'liability', undefined],
    ['cap', '3100', 'equity', undefined],
    ['rev', '4000', 'revenue', undefined],
    ['cogs', '5000', 'expense', 'cogs'],
    ['rent', '6100', 'expense', undefined],
  ] as const)
    ids[k] = (
      await a('admin')
        .post(`${base()}/accounts`, { code, name: `A${code}`, type, isPosting: true, reportingClass })
        .expect(201)
    ).body.id;
  await a('admin')
    .post(`${base()}/fiscal-periods`, { name: 'FY2026', startDate: '2026-01-01', endDate: '2026-12-31' })
    .expect(201);
  // Ledger fixture (synthetic): September and October 2026.
  await journal('2026-01-05', null, 'cash', 'cap', '1000.00'); // capital, company level
  await journal('2026-09-10', 'DOH', 'cash', 'rev', '200.00');
  await journal('2026-09-20', 'DOH', 'rent', 'cash', '50.00');
  await journal('2026-10-05', 'DOH', 'cash', 'rev', '300.00');
  await journal('2026-10-06', 'DOH', 'cogs', 'cash', '120.00');
  await journal('2026-10-07', 'WAK', 'cash', 'rev', '40.00');
  await journal('2026-10-20', 'DOH', 'rent', 'cash', '80.00');
  await person('dohReader', ['reports.financial.read'], ids.DOH!);
  await person('nobody', ['org.company.read'], ids.DOH!);
});

afterAll(async () => {
  await prisma.$disconnect();
  await app.close();
});

describe('profit and loss', () => {
  it('October against the previous 31 days, all branches', async () => {
    const r = (
      await a('admin').get(`${base()}/reports/profit-and-loss?from=2026-10-01&to=2026-10-31`).expect(200)
    ).body;
    // Revenue 300 + 40 = 340; COGS 120; opex 80 → gross 220, net 140, margin 220/340 = 64.7 %.
    // Previous period 2026-08-31..2026-09-30: revenue 200, opex 50 → gross 200, net 150.
    expect(r).toMatchObject({
      previousFrom: '2026-08-31',
      previousTo: '2026-09-30',
      revenue: { total: '340.00', previousTotal: '200.00' },
      costOfSales: { total: '120.00' },
      operatingExpenses: { total: '80.00' },
      grossProfit: { amount: '220.00', previous: '200.00', changePct: '10.0' },
      netProfit: { amount: '140.00', previous: '150.00', changePct: '-6.7' },
      grossMarginPct: '64.7',
      previousGrossMarginPct: '100.0',
    });
    expect(r.revenue.lines).toEqual([
      expect.objectContaining({ code: '4000', amount: '340.00', previous: '200.00', changePct: '70.0' }),
    ]);
    expect(r.operatingExpenses.lines[0]).toMatchObject({ code: '6100', amount: '80.00', previous: '50.00' });
  });

  it('branch scope: a DOH reader sees DOH only; an explicit other branch is refused; no permission, no report', async () => {
    const r = (
      await a('dohReader').get(`${base()}/reports/profit-and-loss?from=2026-10-01&to=2026-10-31`).expect(200)
    ).body;
    expect(r.revenue.total).toBe('300.00');
    expect(r.netProfit.amount).toBe('100.00'); // 300 − 120 − 80
    await a('dohReader')
      .get(`${base()}/reports/profit-and-loss?from=2026-10-01&to=2026-10-31&branchId=${ids.WAK}`)
      .expect(403);
    await a('nobody').get(`${base()}/reports/profit-and-loss?from=2026-10-01&to=2026-10-31`).expect(403);
    await a('admin').get(`${base()}/reports/profit-and-loss?from=2026-10-31&to=2026-10-01`).expect(400);
    const none = (
      await a('admin')
        .get(`${base()}/reports/profit-and-loss?from=2026-10-01&to=2026-10-31&compare=none`)
        .expect(200)
    ).body;
    expect(none).toMatchObject({ previousFrom: null, grossProfit: { previous: null } });
  });
});

describe('balance sheet', () => {
  it('assets equal liabilities plus equity, with the unclosed result shown', async () => {
    // Cash at 31 Oct: 1000 + 200 − 50 + 300 − 120 + 40 − 80 = 1290. Result since the start: 540 − 250 = 290.
    const oct = (await a('admin').get(`${base()}/reports/balance-sheet?asOf=2026-10-31`).expect(200)).body;
    expect(oct).toMatchObject({
      assets: { total: '1290.00' },
      liabilities: { total: '0.00' },
      equity: { total: '1000.00' },
      unclosedResult: '290.00',
      totalLiabilitiesAndEquity: '1290.00',
      balanced: true,
      difference: '0.00',
    });
    const sep = (await a('admin').get(`${base()}/reports/balance-sheet?asOf=2026-09-30`).expect(200)).body;
    expect(sep).toMatchObject({ assets: { total: '1150.00' }, unclosedResult: '150.00', balanced: true });
  });
});

describe('aging', () => {
  it('receivables: an invoice with a part payment, aged from its date, reconciled to the receivable account', async () => {
    // Billing set-up: rate 150/h, no tax; a 2-hour job → invoice 300.00; 100.00 paid in cash.
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
        payablesAccountId: ids.ap,
      })
      .expect(200);
    await a('admin')
      .post(`${base()}/branches/${ids.DOH}/labour-rates`, { rate: '150', effectiveFrom: today })
      .expect(201);
    const c = (
      await a('admin').post(`${base()}/customers`, { name: 'Noor', phone: '+97455550909' }).expect(201)
    ).body.id;
    const v = (
      await a('admin')
        .post(`${base()}/vehicles`, {
          customerId: c,
          plate: `RP ${uid().slice(0, 4)}`,
          make: 'Kia',
          model: 'Rio',
        })
        .expect(201)
    ).body.id;
    const tech = await createUser(prisma);
    const techRole = (
      await a('admin')
        .post(`${base()}/roles`, {
          code: `t-${uid()}`,
          name: 'tech',
          permissions: ['workshop.job.read', 'workshop.job.work'],
        })
        .expect(201)
    ).body.id;
    await a('admin')
      .post(`${base()}/role-assignments`, { userId: tech.id, roleId: techRole, branchId: ids.DOH })
      .expect(201);
    tok.tech = await auth.sign(tech.sub);
    const qcUser = await createUser(prisma);
    const qcRole = (
      await a('admin')
        .post(`${base()}/roles`, {
          code: `q-${uid()}`,
          name: 'qc',
          permissions: ['workshop.job.read', 'workshop.job.qc'],
        })
        .expect(201)
    ).body.id;
    await a('admin')
      .post(`${base()}/role-assignments`, { userId: qcUser.id, roleId: qcRole, branchId: ids.DOH })
      .expect(201);
    tok.qc = await auth.sign(qcUser.sub);
    let j = (
      await a('admin')
        .post(`${base()}/jobs`, {
          branchId: ids.DOH,
          vehicleId: v,
          complaint: 'Service',
          odometerIn: 10,
          fuelLevel: 'half',
          tasks: [{ description: 'Service', estimatedHours: '2' }],
        })
        .expect(201)
    ).body;
    const step = async (t: string, path: string, body: object) =>
      (j = (
        await a(t)
          .post(`${base()}/jobs/${j.id}/${path}`, { version: j.version, ...body })
          .expect(200)
      ).body);
    await step('admin', 'inspection', { items: INSPECTION_ITEMS.map((i) => ({ key: i.key, status: 'ok' })) });
    await step('admin', 'authorize', { authorizedByName: 'Noor', authorizedVia: 'in_person' });
    await step('admin', `tasks/${j.tasks[0].id}/assign`, { technicianId: tech.id });
    await step('tech', 'start', {});
    await step('tech', `tasks/${j.tasks[0].id}/complete`, {});
    await step('tech', 'submit-qc', {});
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
    expect(inv.total).toBe('300.00');
    await a('admin')
      .post(`${base()}/invoices/${inv.id}/payments`, {
        method: 'cash',
        amount: '100',
        idempotencyKey: randomUUID(),
      })
      .expect(201);

    const r = (await a('admin').get(`${base()}/reports/receivables-aging?asOf=${today}`).expect(200)).body;
    expect(r).toMatchObject({
      buckets: ['d0_30', 'd31_60', 'd61_90', 'd90plus'],
      totals: { d0_30: '200.00', d31_60: '0.00', d61_90: '0.00', d90plus: '0.00' },
      total: '200.00',
      ledgerBalance: '200.00',
      reconciled: true,
    });
    expect(r.parties).toEqual([expect.objectContaining({ name: 'Noor', documents: 1, total: '200.00' })]);
    expect(r.documents[0]).toMatchObject({ number: inv.number, total: '300.00', balance: '200.00', days: 0 });
    // The day before, nothing was posted yet.
    const before = (
      await a('admin')
        .get(`${base()}/reports/receivables-aging?asOf=${daysAgo(1)}`)
        .expect(200)
    ).body;
    expect(before).toMatchObject({ total: '0.00', ledgerBalance: '0.00', reconciled: true, documents: [] });
  });

  it('payables: a bill dated 40 days ago, part paid, by days past due, reconciled to payables', async () => {
    ids.gulf = (
      await a('admin').post(`${base()}/suppliers`, { name: 'Gulf Parts', paymentTermsDays: 0 }).expect(201)
    ).body.id;
    ids.part = (
      await a('admin').post(`${base()}/parts`, { sku: 'OIL', name: 'Oil', unit: 'litre' }).expect(201)
    ).body.id;
    const p = (
      await a('admin')
        .post(`${base()}/parts/${ids.part}/receipts`, {
          branchId: ids.DOH,
          supplierId: ids.gulf,
          quantity: '10',
          unitCost: '25',
          reference: 'DN-1',
          idempotencyKey: randomUUID(),
        })
        .expect(201)
    ).body;
    const bill = (
      await a('admin')
        .post(`${base()}/supplier-bills`, {
          supplierId: ids.gulf,
          branchId: ids.DOH,
          supplierInvoiceNo: 'GP-1',
          billDate: daysAgo(40),
          taxCodeId: null,
          lines: [{ movementId: p.movements[0].id, amount: '250.00' }],
          idempotencyKey: randomUUID(),
        })
        .expect(201)
    ).body;
    // The owner may pay a bill they entered: 70.00 in cash.
    await a('admin')
      .post(`${base()}/supplier-bills/${bill.id}/payments`, {
        method: 'cash',
        amount: '70',
        idempotencyKey: randomUUID(),
      })
      .expect(201);
    const r = (await a('admin').get(`${base()}/reports/payables-aging?asOf=${today}`).expect(200)).body;
    // Due on the bill date (0 days' terms) → 40 days past due → 31–60; balance 250 − 70 = 180.
    expect(r).toMatchObject({
      buckets: ['current', 'd1_30', 'd31_60', 'd61_90', 'd90plus'],
      totals: { current: '0.00', d1_30: '0.00', d31_60: '180.00', d61_90: '0.00', d90plus: '0.00' },
      total: '180.00',
      ledgerBalance: '180.00',
      reconciled: true,
    });
    expect(r.documents[0]).toMatchObject({ partyName: 'Gulf Parts', balance: '180.00', days: 40 });
    await a('nobody').get(`${base()}/reports/payables-aging?asOf=${today}`).expect(403);
    await a('admin').get(`${base()}/reports/payables-aging?asOf=2026-02-30`).expect(400);
  });
});

describe('cash flow', () => {
  it('by source from opening to closing; a cash-to-bank move is internal', async () => {
    ids.bank = (
      await a('admin')
        .post(`${base()}/accounts`, {
          code: '1150',
          name: 'Bank',
          type: 'asset',
          isPosting: true,
          reportingClass: 'bank',
        })
        .expect(201)
    ).body.id;
    await journal('2026-10-25', 'DOH', 'bank', 'cash', '25.00'); // between cash accounts
    // Year to date: manual in 1000 + 200 + 300 + 40 = 1540, out 50 + 120 + 80 = 250;
    // customer receipt 100; supplier payment 70 → closing 1320.
    const y = (await a('admin').get(`${base()}/reports/cash-flow?from=2026-01-01&to=${today}`).expect(200))
      .body;
    expect(y).toMatchObject({
      configured: true,
      opening: '0.00',
      inflow: '1640.00',
      outflow: '320.00',
      net: '1320.00',
      closing: '1320.00',
      internalTransfers: 1,
      reconciled: true,
    });
    const by = Object.fromEntries(
      y.categories.map((c: { key: string; net: string; journals: number }) => [c.key, [c.net, c.journals]]),
    );
    expect(by).toEqual({
      customer_receipts: ['100.00', 1],
      supplier_payments: ['-70.00', 1],
      manual: ['1290.00', 7],
      reversals: ['0.00', 0],
      other: ['0.00', 0],
    });
    // October: opening 1000 + 200 − 50 = 1150; in 340, out 200 → 1290.
    const oct = (
      await a('admin').get(`${base()}/reports/cash-flow?from=2026-10-01&to=2026-10-31`).expect(200)
    ).body;
    expect(oct).toMatchObject({
      opening: '1150.00',
      inflow: '340.00',
      outflow: '200.00',
      closing: '1290.00',
      reconciled: true,
    });
    await a('nobody').get(`${base()}/reports/cash-flow?from=2026-10-01&to=2026-10-31`).expect(403);
  });
});

describe('tax summary', () => {
  it('output and input tax by code, checked against the tax accounts', async () => {
    ids.vatOut = (
      await a('admin')
        .post(`${base()}/accounts`, { code: '2300', name: 'VAT payable', type: 'liability', isPosting: true })
        .expect(201)
    ).body.id;
    ids.vatIn = (
      await a('admin')
        .post(`${base()}/accounts`, { code: '1450', name: 'VAT recoverable', type: 'asset', isPosting: true })
        .expect(201)
    ).body.id;
    const s = (await a('admin').get(`${base()}/posting-settings`).expect(200)).body;
    await a('admin')
      .put(`${base()}/posting-settings`, {
        version: s.version,
        labourRevenueAccountId: ids.rev,
        receivableAccountId: ids.ar,
        cashAccountId: ids.cash,
        cardAccountId: null,
        bankAccountId: null,
        inventoryAccountId: ids.inv,
        goodsReceivedAccountId: ids.grni,
        payablesAccountId: ids.ap,
        inputTaxAccountId: ids.vatIn,
      })
      .expect(200);
    const vat = (
      await a('admin')
        .post(`${base()}/tax/codes`, { code: 'VAT', name: 'VAT', outputAccountId: ids.vatOut })
        .expect(201)
    ).body.codes[0].id;
    await a('admin')
      .post(`${base()}/tax/codes/${vat}/rates`, { rate: '5', effectiveFrom: today })
      .expect(201);
    const p = (
      await a('admin')
        .post(`${base()}/parts/${ids.part}/receipts`, {
          branchId: ids.DOH,
          supplierId: ids.gulf,
          quantity: '4',
          unitCost: '25',
          reference: 'DN-2',
          idempotencyKey: randomUUID(),
        })
        .expect(201)
    ).body;
    await a('admin')
      .post(`${base()}/supplier-bills`, {
        supplierId: ids.gulf,
        branchId: ids.DOH,
        supplierInvoiceNo: 'GP-2',
        billDate: today,
        taxCodeId: vat,
        lines: [{ movementId: p.movements[0].id, amount: '100.00' }],
        idempotencyKey: randomUUID(),
      })
      .expect(201);
    const from = `${today.slice(0, 7)}-01`;
    const r = (await a('admin').get(`${base()}/reports/tax-summary?from=${from}&to=${today}`).expect(200))
      .body;
    // Output: the 300.00 invoice without tax. Input: GP-1 250.00 without tax; GP-2 100.00 + 5.00 VAT.
    expect(r).toMatchObject({
      output: [{ taxCode: null, documents: 1, taxable: '300.00', tax: '0.00' }],
      input: [
        { taxCode: null, documents: 1, taxable: '250.00', tax: '0.00' },
        { taxCode: 'VAT', documents: 1, taxable: '100.00', tax: '5.00' },
      ],
      outputTax: '0.00',
      inputTax: '5.00',
      netTax: '-5.00',
      outputLedger: '0.00',
      inputLedger: '5.00',
      outputReconciled: true,
      inputReconciled: true,
    });
  });
});
