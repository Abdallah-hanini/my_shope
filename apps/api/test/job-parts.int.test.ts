import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { INSPECTION_ITEMS } from '@erp/validation';
import { randomUUID } from 'node:crypto';
import { localTime } from '../src/workshop/scheduling';
import { api, bootApp, createUser, uid, type TestAuth } from './helpers';

// T-75 parts on jobs: reserve within availability, the owner's selling price, issue at weighted
// average (Dr cost of parts sold, Cr inventory), return at the issue cost, QC and cancel rules,
// part lines on quotes, invoice revenue split labour/parts, reconciliation, database guarantees.

let app: INestApplication;
let auth: TestAuth;
let prisma: PrismaClient;
let companyId: string;
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};
const base = () => `/companies/${companyId}`;
type JP = { id: string; status: string; quantity: string; cost: string | null; actions: string[] };
type Parts = { parts: JP[]; canAdd: boolean; choices: { sku: string; available: string }[] };

async function person(name: string, permissions: string[]) {
  const role = (
    await api(app, tok.admin)
      .post(`${base()}/roles`, { code: `r-${uid()}`, name, permissions })
      .expect(201)
  ).body.id;
  const u = await createUser(prisma);
  await prisma.user.update({ where: { id: u.id }, data: { displayName: name } });
  await api(app, tok.admin)
    .post(`${base()}/role-assignments`, { userId: u.id, roleId: role, branchId: ids.DOH })
    .expect(201);
  ids[name] = u.id;
  tok[name] = await auth.sign(u.sub);
}
const a = (t: string) => api(app, tok[t]);
const parts = async (job = ids.job): Promise<Parts> =>
  (await a('advisor').get(`${base()}/jobs/${job}/parts`).expect(200)).body;
const reserve = (t: string, quantity: string, job = ids.job) =>
  a(t).post(`${base()}/jobs/${job}/parts`, { partId: ids.oil, quantity });
const stepJp = (t: string, jp: string, op: string) =>
  a(t).post(`${base()}/job-parts/${jp}/${op}`, op === 'release' ? {} : { idempotencyKey: randomUUID() });
const jobOf = async (id = ids.job) => (await a('advisor').get(`${base()}/jobs/${id}`).expect(200)).body;
const balance = async (code: string) => {
  const r = await prisma.journalLine.aggregate({
    where: { companyId, account: { code } },
    _sum: { debit: true, credit: true },
  });
  return (Number(r._sum.debit ?? 0) - Number(r._sum.credit ?? 0)).toFixed(2);
};
async function newJob() {
  return (
    await a('advisor')
      .post(`${base()}/jobs`, {
        branchId: ids.DOH,
        vehicleId: ids.vehicle,
        complaint: 'Oil change',
        odometerIn: 5,
        fuelLevel: 'half',
        tasks: [{ description: 'Oil change', estimatedHours: '1' }],
      })
      .expect(201)
  ).body.id as string;
}

beforeAll(async () => {
  ({ app, auth, prisma } = await bootApp());
  const admin = await createUser(prisma, { platformAdmin: true });
  tok.admin = await auth.sign(admin.sub);
  companyId = (
    await api(app, tok.admin)
      .post('/companies', {
        code: `J${uid()}`,
        legalName: 'Job parts fixture',
        baseCurrency: 'QAR',
        timezone: 'Asia/Qatar',
        initialAdminUserId: admin.id,
      })
      .expect(201)
  ).body.id;
  ids.DOH = (await a('admin').post(`${base()}/branches`, { code: 'DOH', name: 'DOH' }).expect(201)).body.id;
  const read = ['org.company.read', 'workshop.job.read', 'inventory.read'];
  await person('advisor', [...read, 'crm.customer.read', 'crm.customer.manage', 'workshop.job.manage']);
  await person('storekeeper', [...read, 'inventory.manage']);
  await person('cashier', [...read, 'billing.invoice.manage']);
  await person('tech', [...read, 'workshop.job.work']);
  await person('inspector', [...read, 'workshop.job.qc']);
  const c = (await a('advisor').post(`${base()}/customers`, { name: 'C', phone: '+97455551010' }).expect(201))
    .body.id;
  ids.vehicle = (
    await a('advisor')
      .post(`${base()}/vehicles`, {
        customerId: c,
        plate: `JP ${uid().slice(0, 4)}`,
        make: 'Kia',
        model: 'Rio',
      })
      .expect(201)
  ).body.id;
  const acct = async (code: string, type: string) =>
    (
      await a('admin')
        .post(`${base()}/accounts`, { code, name: `A${code}`, type, isPosting: true })
        .expect(201)
    ).body.id as string;
  const acc: Record<string, string> = {};
  for (const [k, code, type] of [
    ['cash', '1100', 'asset'],
    ['ar', '1200', 'asset'],
    ['inv', '1400', 'asset'],
    ['grni', '2200', 'liability'],
    ['rev', '4000', 'revenue'],
    ['parts', '4100', 'revenue'],
    ['cogs', '5000', 'expense'],
    ['adj', '5900', 'expense'],
  ] as const)
    acc[k] = await acct(code, type);
  await a('admin')
    .put(`${base()}/posting-settings`, {
      version: 0,
      labourRevenueAccountId: acc.rev,
      receivableAccountId: acc.ar,
      cashAccountId: acc.cash,
      cardAccountId: null,
      bankAccountId: null,
      inventoryAccountId: acc.inv,
      goodsReceivedAccountId: acc.grni,
      stockAdjustmentAccountId: acc.adj,
      cogsAccountId: acc.cogs,
      partsRevenueAccountId: acc.parts,
    })
    .expect(200);
  const today = localTime(new Date(), 'Asia/Qatar').date;
  await a('admin')
    .post(`${base()}/fiscal-periods`, {
      name: 'FY',
      startDate: `${today.slice(0, 4)}-01-01`,
      endDate: `${today.slice(0, 4)}-12-31`,
    })
    .expect(201);
  await a('admin')
    .post(`${base()}/branches/${ids.DOH}/labour-rates`, { rate: '100', effectiveFrom: today })
    .expect(201);
  ids.oil = (
    await a('admin').post(`${base()}/parts`, { sku: 'OIL', name: 'Engine oil', unit: 'litre' }).expect(201)
  ).body.id;
  await a('admin')
    .post(`${base()}/parts/${ids.oil}/receipts`, {
      branchId: ids.DOH,
      quantity: '10',
      unitCost: '8',
      reference: 'DN-1',
      idempotencyKey: randomUUID(),
    })
    .expect(201);
  ids.job = await newJob();
});

afterAll(async () => {
  await prisma.$disconnect();
  await app.close();
});

describe('reserving parts', () => {
  it('managers and stock managers reserve within what is available; technicians cannot', async () => {
    expect((await parts()).choices).toEqual([expect.objectContaining({ sku: 'OIL', available: '10.000' })]);
    await reserve('tech', '1').expect(403);
    const r: Parts = (await reserve('advisor', '4').expect(201)).body;
    expect(r.parts[0]).toMatchObject({ status: 'reserved', quantity: '4.000', actions: ['release'] }); // draft: not issuable yet
    ids.a = r.parts[0]!.id;
    expect((await reserve('advisor', '7').expect(422)).body.detail).toMatch(
      /Only 6.000 litre of OIL available/,
    );
    const s: Parts = (await reserve('storekeeper', '1').expect(201)).body;
    const one = s.parts[1]!;
    await stepJp('advisor', one.id, 'release').expect(200);
    const part = (await a('advisor').get(`${base()}/parts/${ids.oil}`).expect(200)).body;
    expect(part.branches[0]).toMatchObject({ onHand: '10.000', reserved: '4.000' });
  });

  it('quotes price parts at the owner’s selling price', async () => {
    let q = await a('advisor').post(`${base()}/jobs/${ids.job}/quotes`).expect(422);
    expect(q.body.detail).toMatch(/Set the selling price of OIL/);
    const part = (await a('advisor').get(`${base()}/parts/${ids.oil}`).expect(200)).body;
    expect(part.canSetPrice).toBe(false);
    await a('advisor')
      .put(`${base()}/parts/${ids.oil}/price`, { version: part.version, salePrice: '12.50' })
      .expect(403);
    await a('admin')
      .put(`${base()}/parts/${ids.oil}/price`, { version: part.version, salePrice: '12.50' })
      .expect(200);
    q = await a('advisor').post(`${base()}/jobs/${ids.job}/quotes`).expect(201);
    const draft = q.body.quotes[0];
    expect(
      draft.lines.map((l: { kind: string; hours: string; rate: string; amount: string }) => [
        l.kind,
        l.hours,
        l.rate,
        l.amount,
      ]),
    ).toEqual([
      ['labour', '1.00', '100.00', '100.00'],
      ['part', '4.000', '12.50', '50.00'],
    ]);
    expect(draft.total).toBe('150.00');
    await a('advisor').post(`${base()}/quotes/${draft.id}/discard`, { version: draft.version }).expect(200);
  });
});

describe('issuing and returning', () => {
  it('issue after authorisation: stock out at the average, Dr cost of parts sold / Cr inventory', async () => {
    expect((await stepJp('advisor', ids.a!, 'issue').expect(409)).body.detail).toMatch(/authorised/);
    let j = await jobOf();
    const step = async (t: string, path: string, body: object = {}) =>
      (j = (
        await a(t)
          .post(`${base()}/jobs/${ids.job}/${path}`, { version: j.version, ...body })
          .expect(200)
      ).body);
    await step('advisor', 'inspection', {
      items: INSPECTION_ITEMS.map((i) => ({ key: i.key, status: 'ok' })),
    });
    await step('advisor', 'authorize', { authorizedByName: 'C', authorizedVia: 'phone' });
    await step('advisor', `tasks/${j.tasks[0].id}/assign`, { technicianId: ids.tech });
    await step('tech', 'start');
    await stepJp('tech', ids.a!, 'issue').expect(403);
    const r: Parts = (await stepJp('storekeeper', ids.a!, 'issue').expect(200)).body;
    expect(r.parts.find((x) => x.id === ids.a)).toMatchObject({
      status: 'issued',
      cost: '32.00',
      actions: ['return'],
    });
    expect([await balance('5000'), await balance('1400')]).toEqual(['32.00', '48.00']);
  });

  it('returns go back in at the issue cost; QC waits for reserved parts; issued parts block cancelling', async () => {
    const b = (await reserve('advisor', '1').expect(201)).body.parts.at(-1).id;
    await stepJp('advisor', b, 'issue').expect(200);
    expect(await balance('5000')).toBe('40.00');
    const back: Parts = (await stepJp('advisor', b, 'return').expect(200)).body;
    expect(back.parts.find((x) => x.id === b)).toMatchObject({ status: 'returned', actions: [] });
    expect([await balance('5000'), await balance('1400')]).toEqual(['32.00', '48.00']);
    await stepJp('advisor', b, 'return').expect(409);
    const c = (await reserve('advisor', '1').expect(201)).body.parts.at(-1).id;
    let j = await jobOf();
    await a('tech')
      .post(`${base()}/jobs/${ids.job}/tasks/${j.tasks[0].id}/complete`, { version: j.version })
      .expect(200);
    j = await jobOf();
    expect(
      (await a('tech').post(`${base()}/jobs/${ids.job}/submit-qc`, { version: j.version }).expect(422)).body
        .detail,
    ).toMatch(/still only reserved/);
    expect(
      (
        await a('advisor')
          .post(`${base()}/jobs/${ids.job}/cancel`, { version: j.version, reason: 'Changed mind' })
          .expect(409)
      ).body.detail,
    ).toMatch(/return them to stock/);
    await stepJp('advisor', c, 'release').expect(200);
    j = await jobOf();
    await a('tech').post(`${base()}/jobs/${ids.job}/submit-qc`, { version: j.version }).expect(200);
  });
});

describe('quote, invoice and reconciliation', () => {
  it('the invoice splits revenue between labour and parts; stock value matches the ledger', async () => {
    let j = await jobOf();
    await a('inspector')
      .post(`${base()}/jobs/${ids.job}/qc`, { version: j.version, result: 'pass' })
      .expect(200);
    let q = (await a('advisor').post(`${base()}/jobs/${ids.job}/quotes`).expect(201)).body.quotes[0];
    expect(q.total).toBe('150.00'); // the issued 4 litres; returned and released parts are not charged
    q = (await a('advisor').post(`${base()}/quotes/${q.id}/issue`, { version: q.version }).expect(200)).body
      .quotes[0];
    await a('advisor')
      .post(`${base()}/quotes/${q.id}/decision`, {
        version: q.version,
        decision: 'approve',
        authorizedByName: 'C',
        authorizedVia: 'phone',
      })
      .expect(200);
    await a('cashier').post(`${base()}/jobs/${ids.job}/invoices`, { quoteId: q.id }).expect(201);
    expect([await balance('1200'), await balance('4000'), await balance('4100')]).toEqual([
      '150.00',
      '-100.00',
      '-50.00',
    ]);
    const v = (await a('admin').get(`${base()}/inventory/valuation`).expect(200)).body;
    expect(v).toMatchObject({ totalValue: '48.00', ledgerBalance: '48.00', reconciled: true });
    j = await jobOf();
    expect(j.events.map((e: { kind: string }) => e.kind)).toEqual(
      expect.arrayContaining(['part_reserved', 'part_issued', 'part_returned', 'part_released']),
    );
  });

  it('cancelling a job gives its reservations back; job parts never change; reservations are checked by the database', async () => {
    const job2 = await newJob();
    await reserve('advisor', '2', job2).expect(201);
    const j = await jobOf(job2);
    await a('advisor')
      .post(`${base()}/jobs/${job2}/cancel`, { version: j.version, reason: 'No longer needed' })
      .expect(200);
    expect((await parts(job2)).parts[0]).toMatchObject({ status: 'released' });
    await expect(prisma.jobPart.update({ where: { id: ids.a }, data: { quantity: 1 } })).rejects.toThrow(
      /job_part_immutable/,
    );
    await expect(
      prisma.jobPart.create({
        data: {
          companyId,
          branchId: ids.DOH!,
          jobId: ids.job!,
          partId: ids.oil!,
          quantity: 100,
          createdBy: ids.advisor!,
        },
      }),
    ).rejects.toThrow(/job_part_not_available/);
  });
});
