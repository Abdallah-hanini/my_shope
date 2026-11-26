import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { INSPECTION_ITEMS } from '@erp/validation';
import { randomUUID } from 'node:crypto';
import { OutboxDispatcher } from '../src/platform/outbox-dispatcher';
import { localTime } from '../src/workshop/scheduling';
import { api, bootApp, createUser, uid, type TestAuth } from './helpers';

// T-77 special orders: a part the branch has too little of is ordered for a job once the customer
// authorised; a delivery reserves it for the job automatically (oldest order first, never more than
// is on hand) and tells the branch's managers; orders can be cancelled with a reason; the quality
// check waits for them; cancelling the job cancels them; quotes price them; the special orders list;
// database guarantees.

let app: INestApplication;
let auth: TestAuth;
let prisma: PrismaClient;
let companyId: string;
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};
const base = () => `/companies/${companyId}`;
type JP = {
  id: string;
  status: string;
  quantity: string;
  supplierName: string | null;
  orderRef: string | null;
  orderedAt: string | null;
  arrivedAt: string | null;
  cancelReason: string | null;
  actions: string[];
};
type Parts = {
  parts: JP[];
  canOrder: boolean;
  orderChoices: { sku: string; available: string }[];
  suppliers: { name: string }[];
};

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
const parts = async (job: string): Promise<Parts> =>
  (await a('advisor').get(`${base()}/jobs/${job}/parts`).expect(200)).body;
const order = (t: string, job: string, quantity: string, extra: object = {}) =>
  a(t).post(`${base()}/jobs/${job}/parts/order`, { partId: ids.pad, quantity, ...extra });
const receive = (quantity: string) =>
  a('storekeeper')
    .post(`${base()}/parts/${ids.pad}/receipts`, {
      branchId: ids.DOH,
      supplierId: ids.gulf,
      quantity,
      unitCost: '40',
      reference: `DN-${uid()}`,
      idempotencyKey: randomUUID(),
    })
    .expect(201);
const jobOf = async (id: string) => (await a('advisor').get(`${base()}/jobs/${id}`).expect(200)).body;
async function newJob() {
  return (
    await a('advisor')
      .post(`${base()}/jobs`, {
        branchId: ids.DOH,
        vehicleId: ids.vehicle,
        complaint: 'Brakes',
        odometerIn: 5,
        fuelLevel: 'half',
        tasks: [{ description: 'Front pads', estimatedHours: '1' }],
      })
      .expect(201)
  ).body.id as string;
}
async function authorise(job: string, start = false) {
  let j = await jobOf(job);
  const step = async (t: string, path: string, body: object = {}) =>
    (j = (
      await a(t)
        .post(`${base()}/jobs/${job}/${path}`, { version: j.version, ...body })
        .expect(200)
    ).body);
  await step('advisor', 'inspection', { items: INSPECTION_ITEMS.map((i) => ({ key: i.key, status: 'ok' })) });
  await step('advisor', 'authorize', { authorizedByName: 'C', authorizedVia: 'phone' });
  if (start) {
    await step('advisor', `tasks/${j.tasks[0].id}/assign`, { technicianId: ids.tech });
    await step('tech', 'start');
  }
}

beforeAll(async () => {
  ({ app, auth, prisma } = await bootApp());
  const admin = await createUser(prisma, { platformAdmin: true });
  tok.admin = await auth.sign(admin.sub);
  ids.admin = admin.id;
  companyId = (
    await api(app, tok.admin)
      .post('/companies', {
        code: `S${uid()}`,
        legalName: 'Special orders fixture',
        baseCurrency: 'QAR',
        timezone: 'Asia/Qatar',
        initialAdminUserId: admin.id,
      })
      .expect(201)
  ).body.id;
  ids.DOH = (await a('admin').post(`${base()}/branches`, { code: 'DOH', name: 'DOH' }).expect(201)).body.id;
  ids.WAK = (await a('admin').post(`${base()}/branches`, { code: 'WAK', name: 'WAK' }).expect(201)).body.id;
  const read = ['org.company.read', 'workshop.job.read', 'inventory.read'];
  await person('advisor', [...read, 'crm.customer.read', 'crm.customer.manage', 'workshop.job.manage']);
  await person('manager2', [...read, 'workshop.job.manage']);
  await person('storekeeper', [...read, 'inventory.manage']);
  await person('tech', [...read, 'workshop.job.work']);
  const c = (await a('advisor').post(`${base()}/customers`, { name: 'C', phone: '+97455551011' }).expect(201))
    .body.id;
  ids.vehicle = (
    await a('advisor')
      .post(`${base()}/vehicles`, {
        customerId: c,
        plate: `SO ${uid().slice(0, 4)}`,
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
  await a('admin')
    .put(`${base()}/posting-settings`, {
      version: 0,
      labourRevenueAccountId: await acct('4000', 'revenue'),
      receivableAccountId: await acct('1200', 'asset'),
      cashAccountId: null,
      cardAccountId: null,
      bankAccountId: null,
      inventoryAccountId: await acct('1400', 'asset'),
      goodsReceivedAccountId: await acct('2200', 'liability'),
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
  ids.pad = (
    await a('admin').post(`${base()}/parts`, { sku: 'PAD', name: 'Brake pads', unit: 'set' }).expect(201)
  ).body.id;
  ids.gulf = (
    await a('admin').post(`${base()}/suppliers`, { name: 'Gulf Parts', paymentTermsDays: 30 }).expect(201)
  ).body.id;
  ids.j1 = await newJob();
  ids.j2 = await newJob();
  ids.j3 = await newJob();
});

afterAll(async () => {
  await prisma.$disconnect();
  await app.close();
});

describe('ordering', () => {
  it('only after the customer authorised, by managers or stock managers, when stock is short', async () => {
    expect((await parts(ids.j1!)).canOrder).toBe(false);
    expect((await order('advisor', ids.j1!, '1').expect(409)).body.detail).toMatch(/authorised/);
    await authorise(ids.j1!, true);
    await authorise(ids.j2!);
    await authorise(ids.j3!);
    const p = await parts(ids.j1!);
    expect(p).toMatchObject({ canOrder: true, suppliers: [{ name: 'Gulf Parts' }] });
    expect(p.orderChoices).toEqual([expect.objectContaining({ sku: 'PAD', available: '0.000' })]);
    await order('tech', ids.j1!, '1').expect(403);
    await order('advisor', ids.j1!, '1', { supplierId: randomUUID() }).expect(404);
    const r: Parts = (
      await order('advisor', ids.j1!, '2', { supplierId: ids.gulf, orderRef: 'PO-77' }).expect(201)
    ).body;
    expect(r.parts[0]).toMatchObject({
      status: 'ordered',
      quantity: '2.000',
      supplierName: 'Gulf Parts',
      orderRef: 'PO-77',
      arrivedAt: null,
      actions: ['cancelOrder'],
    });
    ids.o1 = r.parts[0]!.id;
    ids.o2 = (await order('storekeeper', ids.j2!, '1').expect(201)).body.parts[0].id;
    ids.o3 = (await order('advisor', ids.j3!, '5').expect(201)).body.parts[0].id;
  });

  it('quotes price ordered parts; the quality check waits for them', async () => {
    const part = (await a('admin').get(`${base()}/parts/${ids.pad}`).expect(200)).body;
    await a('admin')
      .put(`${base()}/parts/${ids.pad}/price`, { version: part.version, salePrice: '90' })
      .expect(200);
    const q = (await a('advisor').post(`${base()}/jobs/${ids.j1}/quotes`).expect(201)).body.quotes[0];
    expect(q.lines.map((l: { kind: string; amount: string }) => [l.kind, l.amount])).toEqual([
      ['labour', '100.00'],
      ['part', '180.00'],
    ]);
    await a('advisor').post(`${base()}/quotes/${q.id}/discard`, { version: q.version }).expect(200);
    let j = await jobOf(ids.j1!);
    await a('tech')
      .post(`${base()}/jobs/${ids.j1}/tasks/${j.tasks[0].id}/complete`, { version: j.version })
      .expect(200);
    j = await jobOf(ids.j1!);
    expect(
      (await a('tech').post(`${base()}/jobs/${ids.j1}/submit-qc`, { version: j.version }).expect(422)).body
        .detail,
    ).toMatch(/have not arrived/);
  });
});

describe('arrival', () => {
  it('a delivery reserves waiting orders oldest first, never more than arrived; managers are told', async () => {
    await prisma.notification.deleteMany({ where: { companyId } });
    await receive('2'); // covers o1 (2); o2 (1) must wait
    let p1 = await parts(ids.j1!);
    expect(p1.parts[0]).toMatchObject({ status: 'reserved', actions: ['release', 'issue'] });
    expect(p1.parts[0]!.arrivedAt).not.toBeNull();
    expect((await parts(ids.j2!)).parts[0]).toMatchObject({ status: 'ordered' });
    await receive('3'); // o2 (1) fits; o3 (5) does not: 2 stay free
    expect((await parts(ids.j2!)).parts[0]).toMatchObject({ status: 'reserved' });
    expect((await parts(ids.j3!)).parts[0]).toMatchObject({ status: 'ordered', actions: ['cancelOrder'] });
    const part = (await a('admin').get(`${base()}/parts/${ids.pad}`).expect(200)).body;
    expect(part.branches.find((b: { branchCode: string }) => b.branchCode === 'DOH')).toMatchObject({
      onHand: '5.000',
      reserved: '3.000',
    });
    p1 = await parts(ids.j1!);
    const j = await jobOf(ids.j1!);
    expect(j.events.map((e: { kind: string }) => e.kind)).toEqual(
      expect.arrayContaining(['part_ordered', 'part_arrived']),
    );
    await app.get(OutboxDispatcher).drain(1000);
    const n = await prisma.notification.findMany({
      where: { companyId, kind: 'job_part_arrived' },
      orderBy: { createdAt: 'asc' },
    });
    // The storekeeper received; the branch's managers (and the company administrator) hear, per order.
    expect(n.map((x) => x.userId).sort()).toEqual(
      [ids.admin, ids.admin, ids.advisor, ids.advisor, ids.manager2, ids.manager2].sort(),
    );
    expect(n[0]).toMatchObject({ link: `jobs/${ids.j1}` });
    expect((n[0]!.params as { part: string }).part).toMatch(/PAD Brake pads × 2.000/);
  });

  it('an order can take stock already there by hand; ordering is refused when enough is available', async () => {
    expect((await order('advisor', ids.j3!, '2').expect(409)).body.detail).toMatch(/reserve it instead/);
    await receive('3'); // now 5 free: o3 (5) fits automatically
    expect((await parts(ids.j3!)).parts[0]).toMatchObject({ status: 'reserved' });
    const o4 = (await order('advisor', ids.j3!, '1').expect(201)).body.parts.at(-1);
    expect(o4.actions).toEqual(['cancelOrder']);
    await a('advisor').post(`${base()}/job-parts/${ids.o1}/release`).expect(200); // 2 free again
    const p3 = await parts(ids.j3!);
    const again = p3.parts.find((x) => x.id === o4.id)!;
    expect(again.actions).toEqual(['allocate', 'cancelOrder']);
    await a('tech').post(`${base()}/job-parts/${o4.id}/allocate`).expect(403);
    const r: Parts = (await a('advisor').post(`${base()}/job-parts/${o4.id}/allocate`).expect(200)).body;
    expect(r.parts.find((x) => x.id === o4.id)).toMatchObject({ status: 'reserved' });
    await a('advisor').post(`${base()}/job-parts/${o4.id}/allocate`).expect(409);
  });
});

describe('cancelling and the list', () => {
  it('orders are cancelled with a reason; cancelling the job cancels its orders', async () => {
    const o5 = (await order('advisor', ids.j2!, '9').expect(201)).body.parts.at(-1).id;
    await a('advisor').post(`${base()}/job-parts/${o5}/cancel-order`, { reason: '' }).expect(400);
    const r: Parts = (
      await a('advisor')
        .post(`${base()}/job-parts/${o5}/cancel-order`, { reason: 'Customer changed mind' })
        .expect(200)
    ).body;
    expect(r.parts.find((x) => x.id === o5)).toMatchObject({
      status: 'cancelled',
      cancelReason: 'Customer changed mind',
      actions: [],
    });
    await a('advisor').post(`${base()}/job-parts/${o5}/cancel-order`, { reason: 'Again' }).expect(409);
    const j4 = await newJob();
    await authorise(j4);
    const o6 = (await order('advisor', j4, '20').expect(201)).body.parts[0].id;
    const j = await jobOf(j4);
    await a('advisor')
      .post(`${base()}/jobs/${j4}/cancel`, { version: j.version, reason: 'No longer needed' })
      .expect(200);
    expect(await prisma.jobPart.findUniqueOrThrow({ where: { id: o6 } })).toMatchObject({
      status: 'cancelled',
      cancelReason: 'Job cancelled',
    });
    await receive('20'); // nothing waits any more
    expect(await prisma.jobPart.findUniqueOrThrow({ where: { id: o6 } })).toMatchObject({
      status: 'cancelled',
    });
  });

  it('the special orders list: open orders oldest first, or all, in the caller’s branches', async () => {
    const j5 = await newJob();
    await authorise(j5);
    await order('advisor', j5, '100', { supplierId: ids.gulf }).expect(201);
    const open = (await a('storekeeper').get(`${base()}/special-orders`).expect(200)).body.orders;
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({
      sku: 'PAD',
      quantity: '100.000',
      status: 'ordered',
      supplierName: 'Gulf Parts',
      branchCode: 'DOH',
      daysWaiting: 0,
    });
    const all = (await a('storekeeper').get(`${base()}/special-orders?status=all`).expect(200)).body.orders;
    expect(all.map((o: { status: string }) => o.status)).toEqual(
      expect.arrayContaining(['reserved', 'cancelled', 'ordered']),
    );
    await a('storekeeper').get(`${base()}/special-orders?branchId=${ids.WAK}`).expect(404);
    await a('tech').get(`${base()}/special-orders`).expect(200);
  });

  it('database: order details never change; an order only arrives into stock that is there', async () => {
    await expect(prisma.jobPart.update({ where: { id: ids.o2 }, data: { orderRef: 'X' } })).rejects.toThrow(
      /job_part_immutable/,
    );
    const waiting = await prisma.jobPart.findFirstOrThrow({ where: { companyId, status: 'ordered' } });
    await expect(
      prisma.jobPart.update({
        where: { id: waiting.id },
        data: { status: 'reserved', arrivedAt: new Date() },
      }),
    ).rejects.toThrow(/job_part_not_available/);
    await expect(
      prisma.jobPart.update({ where: { id: waiting.id }, data: { status: 'cancelled' } }),
    ).rejects.toThrow(/job_part_order_shape/);
    await expect(
      prisma.jobPart.update({ where: { id: waiting.id }, data: { status: 'issued' } }),
    ).rejects.toThrow(/job_part_immutable/);
  });
});
