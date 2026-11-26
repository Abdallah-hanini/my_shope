import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { INSPECTION_ITEMS } from '@erp/validation';
import { randomUUID } from 'node:crypto';
import { localTime } from '../src/workshop/scheduling';
import { api, bootApp, createUser, uid, type TestAuth } from './helpers';

// T-72 invoices and payments: the accountant's posting accounts; an invoice from the approved quote
// posted to the ledger; cash, card and bank payments (double submit, concurrency, no overpayment);
// credit notes; the car leaves paid or released by the owner; database guarantees; scope.

const TZ = 'Asia/Qatar';
let app: INestApplication;
let auth: TestAuth;
let prisma: PrismaClient;
let companyId: string;
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};
const base = () => `/companies/${companyId}`;
const today = localTime(new Date(), TZ).date;
type Doc = {
  id: string;
  kind: string;
  number: string;
  total: string;
  balance: string;
  credited: boolean;
  journalNumber: string;
  actions: string[];
  payments: { number: string }[];
};
type Billing = {
  documents: Doc[];
  canInvoice: boolean;
  approvedQuoteId: string | null;
  missingAccounts: string[];
  clearedForDelivery: boolean;
  canReleaseUnpaid: boolean;
};

async function person(name: string, permissions: string[], branch: string) {
  const role = (
    await api(app, tok.admin)
      .post(`${base()}/roles`, { code: `r-${uid()}`, name, permissions })
      .expect(201)
  ).body.id;
  const u = await createUser(prisma);
  await prisma.user.update({ where: { id: u.id }, data: { displayName: name } });
  await api(app, tok.admin)
    .post(`${base()}/role-assignments`, { userId: u.id, roleId: role, branchId: branch })
    .expect(201);
  ids[name] = u.id;
  tok[name] = await auth.sign(u.sub);
}
const a = (t: string) => api(app, tok[t]);
const billing = async (job: string, t = 'cashier'): Promise<Billing> =>
  (await a(t).get(`${base()}/jobs/${job}/billing`).expect(200)).body;
const jobOf = async (id: string) => (await a('advisor').get(`${base()}/jobs/${id}`).expect(200)).body;
const live = (b: Billing) => b.documents.find((d) => d.kind === 'invoice' && !d.credited)!;
const pay = (inv: string, body: object, t = 'cashier') =>
  a(t).post(`${base()}/invoices/${inv}/payments`, { idempotencyKey: randomUUID(), ...body });

/** A job taken to "ready" (QC passed) with an approved quote: 2 h × 150 + 5 % tax = 315.00. */
async function readyJob(): Promise<string> {
  let j = (
    await a('advisor')
      .post(`${base()}/jobs`, {
        branchId: ids.DOH,
        vehicleId: ids.vehicle,
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
  await step('advisor', 'inspection', { items: INSPECTION_ITEMS.map((i) => ({ key: i.key, status: 'ok' })) });
  await step('advisor', 'authorize', { authorizedByName: 'Noor', authorizedVia: 'in_person' });
  await step('advisor', `tasks/${j.tasks[0].id}/assign`, { technicianId: ids.tech });
  await step('tech', 'start', {});
  await step('tech', `tasks/${j.tasks[0].id}/complete`, {});
  await step('tech', 'submit-qc', {});
  await step('inspector', 'qc', { result: 'pass' });
  let q = (await a('advisor').post(`${base()}/jobs/${j.id}/quotes`).expect(201)).body.quotes[0];
  q = (await a('advisor').post(`${base()}/quotes/${q.id}/issue`, { version: q.version }).expect(200)).body
    .quotes[0];
  await a('advisor')
    .post(`${base()}/quotes/${q.id}/decision`, {
      version: q.version,
      decision: 'approve',
      authorizedByName: 'Noor',
      authorizedVia: 'phone',
    })
    .expect(200);
  return j.id;
}

beforeAll(async () => {
  ({ app, auth, prisma } = await bootApp());
  const admin = await createUser(prisma, { platformAdmin: true });
  ids.admin = admin.id;
  tok.admin = await auth.sign(admin.sub);
  companyId = (
    await api(app, tok.admin)
      .post('/companies', {
        code: `B${uid()}`,
        legalName: 'Billing fixture',
        baseCurrency: 'QAR',
        timezone: TZ,
        initialAdminUserId: admin.id,
      })
      .expect(201)
  ).body.id;
  for (const code of ['DOH', 'WAK'])
    ids[code] = (await a('admin').post(`${base()}/branches`, { code, name: code }).expect(201)).body.id;
  const read = ['org.company.read', 'workshop.job.read'];
  await person(
    'advisor',
    [...read, 'crm.customer.read', 'crm.customer.manage', 'workshop.job.manage'],
    ids.DOH!,
  );
  await person('cashier', [...read, 'billing.invoice.manage'], ids.DOH!);
  await person('wakCashier', [...read, 'billing.invoice.manage'], ids.WAK!);
  await person('tech', [...read, 'workshop.job.work'], ids.DOH!);
  await person('inspector', [...read, 'workshop.job.qc'], ids.DOH!);
  const c = (
    await a('advisor').post(`${base()}/customers`, { name: 'Noor', phone: '+97455550808' }).expect(201)
  ).body.id;
  ids.vehicle = (
    await a('advisor')
      .post(`${base()}/vehicles`, {
        customerId: c,
        plate: `BL ${uid().slice(0, 4)}`,
        make: 'Kia',
        model: 'Rio',
      })
      .expect(201)
  ).body.id;
  // Chart, period, prices and tax (synthetic test values).
  const acct = async (code: string, type: string) =>
    (
      await a('admin')
        .post(`${base()}/accounts`, { code, name: `A${code}`, type, isPosting: true })
        .expect(201)
    ).body.id as string;
  for (const [k, code, type] of [
    ['cash', '1100', 'asset'],
    ['card', '1150', 'asset'],
    ['ar', '1200', 'asset'],
    ['bank', '1300', 'asset'],
    ['tax', '2100', 'liability'],
    ['rev', '4000', 'revenue'],
  ] as const)
    ids[k] = await acct(code, type);
  const y = today.slice(0, 4);
  await a('admin')
    .post(`${base()}/fiscal-periods`, { name: `FY${y}`, startDate: `${y}-01-01`, endDate: `${y}-12-31` })
    .expect(201);
  await a('admin')
    .post(`${base()}/branches/${ids.DOH}/labour-rates`, { rate: '150', effectiveFrom: today })
    .expect(201);
  const t5 = (
    await a('admin')
      .post(`${base()}/tax/codes`, { code: 'T5', name: 'Test 5 %', outputAccountId: ids.tax })
      .expect(201)
  ).body.codes[0].id;
  await a('admin').post(`${base()}/tax/codes/${t5}/rates`, { rate: '5', effectiveFrom: today }).expect(201);
  await a('admin')
    .put(`${base()}/tax/settings`, { version: 0, pricesIncludeTax: false, defaultTaxCodeId: t5 })
    .expect(200);
  ids.job = await readyJob();
});

afterAll(async () => {
  await prisma.$disconnect();
  await app.close();
});

describe('posting accounts and invoicing', () => {
  it('nothing posts until the accountant chooses the accounts; account types are checked', async () => {
    const b = await billing(ids.job!);
    expect(b).toMatchObject({
      canInvoice: true,
      missingAccounts: ['labourRevenue', 'receivable', 'cash', 'card', 'bank'],
      clearedForDelivery: false,
    });
    expect(
      (
        await a('cashier')
          .post(`${base()}/jobs/${ids.job}/invoices`, { quoteId: b.approvedQuoteId })
          .expect(422)
      ).body.detail,
    ).toMatch(/accountant/);
    const body = {
      version: 0,
      labourRevenueAccountId: ids.rev,
      receivableAccountId: ids.ar,
      cashAccountId: ids.cash,
      cardAccountId: ids.card,
      bankAccountId: ids.bank,
    };
    await a('advisor').put(`${base()}/posting-settings`, body).expect(403);
    await a('admin')
      .put(`${base()}/posting-settings`, { ...body, labourRevenueAccountId: ids.cash })
      .expect(422);
    expect((await a('admin').put(`${base()}/posting-settings`, body).expect(200)).body).toMatchObject({
      version: 1,
      receivableAccount: { code: '1200' },
    });
  });

  it('the cashier invoices the approved quote; it posts receivable = revenue + tax', async () => {
    const b = await billing(ids.job!);
    await a('advisor').post(`${base()}/jobs/${ids.job}/invoices`, { quoteId: b.approvedQuoteId }).expect(403);
    const r: Billing = (
      await a('cashier')
        .post(`${base()}/jobs/${ids.job}/invoices`, { quoteId: b.approvedQuoteId })
        .expect(201)
    ).body;
    const inv = live(r);
    expect(inv).toMatchObject({
      number: `INV-${today.slice(0, 4)}-000001`,
      total: '315.00',
      balance: '315.00',
      actions: ['pay', 'credit'],
    });
    expect(r.canInvoice).toBe(false);
    const j = await prisma.journal.findUniqueOrThrow({
      where: { id: (await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).journalId },
      include: { lines: { include: { account: true }, orderBy: { lineNo: 'asc' } } },
    });
    expect(j.sourceType).toBe('invoice');
    expect(j.lines.map((l) => [l.account.code, l.debit.toFixed(2), l.credit.toFixed(2)])).toEqual([
      ['1200', '315.00', '0.00'],
      ['4000', '0.00', '300.00'],
      ['2100', '0.00', '15.00'],
    ]);
    await a('cashier').post(`${base()}/jobs/${ids.job}/invoices`, { quoteId: b.approvedQuoteId }).expect(409);
    expect((await jobOf(ids.job!)).events.at(-1)).toMatchObject({ kind: 'invoice_posted' });
  });
});

describe('payments and handover', () => {
  it('the car cannot leave while money is owed', async () => {
    const j = await jobOf(ids.job!);
    const r = await a('advisor')
      .post(`${base()}/jobs/${ids.job}/deliver`, {
        version: j.version,
        deliveredToName: 'Noor',
        odometerOut: 20,
      })
      .expect(422);
    expect(r.body.detail).toMatch(/still has 315.00 QAR to pay/);
    await expect(
      prisma.$executeRaw`UPDATE workshop.job_card SET status = 'delivered', delivered_to_name = 'x', delivered_at = now(), odometer_out = 20 WHERE id = ${ids.job}::uuid`,
    ).rejects.toThrow(/job_delivery_unpaid/);
  });

  it('cash, card and bank payments; a repeated form records once; never more than owed', async () => {
    const inv = live(await billing(ids.job!));
    await pay(inv.id, { method: 'card', amount: '10' }).expect(400); // card needs the slip reference
    expect((await pay(inv.id, { method: 'cash', amount: '315.01' }).expect(422)).body.detail).toMatch(
      /more than the 315.00/,
    );
    await pay(inv.id, { method: 'cash', amount: '10' }, 'advisor').expect(403);
    const key = randomUUID();
    await pay(inv.id, { method: 'cash', amount: '100', idempotencyKey: key }).expect(201);
    const again: Billing = (
      await pay(inv.id, { method: 'cash', amount: '100', idempotencyKey: key }).expect(201)
    ).body;
    expect(live(again)).toMatchObject({ balance: '215.00' });
    expect(live(again).payments).toHaveLength(1);
    await pay(inv.id, { method: 'cash', amount: '50', idempotencyKey: key }).expect(409);
    const done: Billing = (
      await pay(inv.id, { method: 'bank', amount: '215', reference: 'TRX-778' }).expect(201)
    ).body;
    expect(live(done)).toMatchObject({ balance: '0.00', actions: [] });
    expect(done.clearedForDelivery).toBe(true);
    const lines = await prisma.journalLine.findMany({
      where: { journal: { sourceType: 'payment', companyId } },
      include: { account: true },
    });
    expect(lines.filter((l) => l.account.code === '1200').reduce((s, l) => s + Number(l.credit), 0)).toBe(
      315,
    );
    const j = await jobOf(ids.job!);
    await a('advisor')
      .post(`${base()}/jobs/${ids.job}/deliver`, {
        version: j.version,
        deliveredToName: 'Noor',
        odometerOut: 20,
      })
      .expect(200);
    expect(
      (
        await a('cashier')
          .post(`${base()}/invoices/${inv.id}/credit-note`, { reason: 'Wrong price' })
          .expect(409)
      ).body.detail,
    ).toMatch(/refunds/);
  });

  it('two payments of the full balance at the same moment: one is recorded', async () => {
    ids.job2 = await readyJob();
    const b = await billing(ids.job2!);
    const inv = live(
      (
        await a('cashier')
          .post(`${base()}/jobs/${ids.job2}/invoices`, { quoteId: b.approvedQuoteId })
          .expect(201)
      ).body,
    );
    const r = await Promise.all([
      pay(inv.id, { method: 'cash', amount: '315' }),
      pay(inv.id, { method: 'cash', amount: '315' }),
    ]);
    expect(r.map((x) => x.status).sort()).toEqual([201, 422]);
    expect(await prisma.payment.count({ where: { invoiceId: inv.id } })).toBe(1);
  });
});

describe('credit notes, release and guarantees', () => {
  it('a credit note cancels an unpaid invoice by reversing its journal; the quote can be invoiced again', async () => {
    ids.job3 = await readyJob();
    const b = await billing(ids.job3!);
    const inv = live(
      (
        await a('cashier')
          .post(`${base()}/jobs/${ids.job3}/invoices`, { quoteId: b.approvedQuoteId })
          .expect(201)
      ).body,
    );
    await a('cashier').post(`${base()}/invoices/${inv.id}/credit-note`, { reason: 'no' }).expect(400);
    const r: Billing = (
      await a('cashier')
        .post(`${base()}/invoices/${inv.id}/credit-note`, { reason: 'Customer name misspelt' })
        .expect(201)
    ).body;
    const cn = r.documents.find((d) => d.kind === 'credit_note')!;
    expect(cn.number).toMatch(/^CN-\d{4}-000001$/);
    expect(r.documents.find((d) => d.id === inv.id)).toMatchObject({
      credited: true,
      balance: '0.00',
      actions: [],
    });
    expect(r.canInvoice).toBe(true);
    const orig = await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    const rev = await prisma.journal.findFirstOrThrow({ where: { reversalOfId: orig.journalId } });
    expect(rev.sourceType).toBe('reversal');
    await pay(inv.id, { method: 'cash', amount: '1' }).expect(409);
    await a('cashier')
      .post(`${base()}/jobs/${ids.job3}/invoices`, { quoteId: b.approvedQuoteId })
      .expect(201);
  });

  it('only the owner lets a car leave unpaid, with a reason', async () => {
    const j = await jobOf(ids.job3!);
    await a('advisor')
      .post(`${base()}/jobs/${ids.job3}/release-unpaid`, { version: j.version, reason: 'Fleet account' })
      .expect(403);
    await a('admin')
      .post(`${base()}/jobs/${ids.job3}/release-unpaid`, { version: j.version, reason: '' })
      .expect(400);
    const r: Billing = (
      await a('admin')
        .post(`${base()}/jobs/${ids.job3}/release-unpaid`, {
          version: j.version,
          reason: 'Fleet account, pays monthly',
        })
        .expect(200)
    ).body;
    expect(r).toMatchObject({ clearedForDelivery: true, canReleaseUnpaid: false });
    const j2 = await jobOf(ids.job3!);
    await a('advisor')
      .post(`${base()}/jobs/${ids.job3}/deliver`, {
        version: j2.version,
        deliveredToName: 'Noor',
        odometerOut: 20,
      })
      .expect(200);
    expect(live(await billing(ids.job3!)).balance).toBe('315.00'); // still owed, on account
  });

  it('posted documents never change; other branches see nothing', async () => {
    const inv = await prisma.invoice.findFirstOrThrow({ where: { jobId: ids.job, kind: 'invoice' } });
    await expect(prisma.invoice.update({ where: { id: inv.id }, data: { total: 1 } })).rejects.toThrow(
      /invoice_immutable|invoice_amounts/,
    );
    await expect(prisma.$executeRaw`DELETE FROM workshop.invoice WHERE id = ${inv.id}::uuid`).rejects.toThrow(
      /invoice_immutable/,
    );
    await expect(
      prisma.$executeRaw`UPDATE workshop.payment SET amount = 1 WHERE invoice_id = ${inv.id}::uuid`,
    ).rejects.toThrow();
    await a('wakCashier').get(`${base()}/jobs/${ids.job}/billing`).expect(404);
    await a('wakCashier').get(`${base()}/invoices/${inv.id}`).expect(404);
  });
});
