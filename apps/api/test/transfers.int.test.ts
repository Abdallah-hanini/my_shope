import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { INSPECTION_ITEMS } from '@erp/validation';
import { randomUUID } from 'node:crypto';
import { localTime } from '../src/workshop/scheduling';
import { api, bootApp, createUser, uid, type TestAuth } from './helpers';

// T-78 stock transfers: out at the source's weighted average into stock in transit (never stock
// reserved for jobs), in at exactly that value at the receiving branch (serving its special
// orders), or back if cancelled; permissions per branch; each branch's stock value matches the
// ledger; repeated forms record once; database guarantees.

let app: INestApplication;
let auth: TestAuth;
let prisma: PrismaClient;
let companyId: string;
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};
const base = () => `/companies/${companyId}`;
type Transfer = {
  id: string;
  number: string;
  status: string;
  value: string;
  actions: string[];
  lines: {
    sku: string;
    quantity: string;
    value: string;
    outNumber: string;
    inNumber: string | null;
    backNumber: string | null;
  }[];
};

async function person(name: string, permissions: string[], branch: string | null) {
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
  tok[name] = await auth.sign(u.sub);
}
const a = (t: string) => api(app, tok[t]);
const send = (
  t: string,
  lines: { partId: string; quantity: string }[],
  key = randomUUID(),
  from = 'DOH',
  to = 'WAK',
) =>
  a(t).post(`${base()}/transfers`, {
    fromBranchId: ids[from],
    toBranchId: ids[to],
    lines,
    idempotencyKey: key,
  });
const stockAt = async (part: string, code: string) =>
  (
    (await a('admin').get(`${base()}/parts/${part}`).expect(200)).body.branches as {
      branchCode: string;
      onHand: string;
      value: string;
      reserved: string;
    }[]
  ).find((b) => b.branchCode === code)!;
const ledger = async (code: string, branch?: string) => {
  const r = await prisma.journalLine.aggregate({
    where: { companyId, account: { code }, ...(branch ? { branchId: ids[branch] } : {}) },
    _sum: { debit: true, credit: true },
  });
  return (Number(r._sum.debit ?? 0) - Number(r._sum.credit ?? 0)).toFixed(2);
};

beforeAll(async () => {
  ({ app, auth, prisma } = await bootApp());
  const admin = await createUser(prisma, { platformAdmin: true });
  tok.admin = await auth.sign(admin.sub);
  companyId = (
    await api(app, tok.admin)
      .post('/companies', {
        code: `T${uid()}`,
        legalName: 'Transfers fixture',
        baseCurrency: 'QAR',
        timezone: 'Asia/Qatar',
        initialAdminUserId: admin.id,
      })
      .expect(201)
  ).body.id;
  for (const code of ['DOH', 'WAK'])
    ids[code] = (await a('admin').post(`${base()}/branches`, { code, name: code }).expect(201)).body.id;
  const read = ['org.company.read', 'inventory.read', 'workshop.job.read'];
  await person('dohKeeper', [...read, 'inventory.manage'], ids.DOH!);
  await person('wakKeeper', [...read, 'inventory.manage'], ids.WAK!);
  await person(
    'wakManager',
    [...read, 'workshop.job.manage', 'crm.customer.read', 'crm.customer.manage'],
    ids.WAK!,
  );
  await person('viewer', ['inventory.read'], ids.DOH!);
  const acct = async (code: string, type: string) =>
    (
      await a('admin')
        .post(`${base()}/accounts`, { code, name: `A${code}`, type, isPosting: true })
        .expect(201)
    ).body.id as string;
  ids.inv = await acct('1400', 'asset');
  ids.transit = await acct('1410', 'asset');
  ids.grni = await acct('2200', 'liability');
  await a('admin')
    .put(`${base()}/posting-settings`, {
      version: 0,
      labourRevenueAccountId: null,
      receivableAccountId: null,
      cashAccountId: null,
      cardAccountId: null,
      bankAccountId: null,
      inventoryAccountId: ids.inv,
      goodsReceivedAccountId: ids.grni,
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
  ids.oil = (
    await a('admin').post(`${base()}/parts`, { sku: 'OIL', name: 'Oil', unit: 'litre' }).expect(201)
  ).body.id;
  ids.pad = (
    await a('admin').post(`${base()}/parts`, { sku: 'PAD', name: 'Pads', unit: 'set' }).expect(201)
  ).body.id;
  for (const [part, q, c] of [
    [ids.oil, '20', '8.20'],
    [ids.oil, '10', '9.10'],
    [ids.pad, '3', '40'],
  ] as const)
    await a('admin')
      .post(`${base()}/parts/${part}/receipts`, {
        branchId: ids.DOH,
        quantity: q,
        unitCost: c,
        reference: 'DN',
        idempotencyKey: randomUUID(),
      })
      .expect(201);
});

afterAll(async () => {
  await prisma.$disconnect();
  await app.close();
});

describe('sending', () => {
  it('needs the transit account, a stock manager of the sending branch, and two different branches', async () => {
    expect((await send('admin', [{ partId: ids.oil!, quantity: '1' }]).expect(422)).body.detail).toMatch(
      /stock in transit/,
    );
    const s = (await a('admin').get(`${base()}/posting-settings`).expect(200)).body;
    await a('admin')
      .put(`${base()}/posting-settings`, {
        version: s.version,
        labourRevenueAccountId: null,
        receivableAccountId: null,
        cashAccountId: null,
        cardAccountId: null,
        bankAccountId: null,
        inventoryAccountId: ids.inv,
        goodsReceivedAccountId: ids.grni,
        transitAccountId: ids.transit,
      })
      .expect(200);
    await send('wakKeeper', [{ partId: ids.oil!, quantity: '1' }]).expect(404); // DOH not in their branches
    await send('viewer', [{ partId: ids.oil!, quantity: '1' }]).expect(403);
    await send('dohKeeper', [{ partId: ids.oil!, quantity: '1' }], randomUUID(), 'DOH', 'DOH').expect(400);
    await send('dohKeeper', [
      { partId: ids.oil!, quantity: '1' },
      { partId: ids.oil!, quantity: '2' },
    ]).expect(400);
    const l = (await a('dohKeeper').get(`${base()}/transfers`).expect(200)).body;
    expect(l.fromBranches.map((b: { code: string }) => b.code)).toEqual(['DOH']);
    expect(l.toBranches.map((b: { code: string }) => b.code)).toEqual(['DOH', 'WAK']);
  });

  it('out at the weighted average into stock in transit; never more than is free; once per form', async () => {
    expect((await send('dohKeeper', [{ partId: ids.oil!, quantity: '31' }]).expect(422)).body.detail).toMatch(
      /Only 30.000 litre of OIL can be sent from DOH/,
    );
    const key = randomUUID();
    const lines = [
      { partId: ids.oil!, quantity: '10' },
      { partId: ids.pad!, quantity: '1' },
    ];
    const t: Transfer = (await send('dohKeeper', lines, key).expect(201)).body;
    expect(t).toMatchObject({ status: 'in_transit', value: '125.00', actions: ['cancel'] }); // 10 × 8.50 + 40
    expect(t.lines.map((x) => [x.sku, x.value, x.inNumber])).toEqual([
      ['OIL', '85.00', null],
      ['PAD', '40.00', null],
    ]);
    ids.t1 = t.id;
    expect((await send('dohKeeper', lines, key).expect(201)).body.id).toBe(t.id);
    expect(await stockAt(ids.oil!, 'DOH')).toMatchObject({ onHand: '20.000', value: '170.00' });
    expect([await ledger('1410'), await ledger('1400', 'DOH')]).toEqual(['125.00', '250.00']); // 375.00 received − 125.00 sent
    const wak = (await a('wakKeeper').get(`${base()}/transfers/${t.id}`).expect(200)).body;
    expect(wak.actions).toEqual(['receive']);
  });

  it('stock reserved for jobs stays at the branch', async () => {
    const c = (await a('admin').post(`${base()}/customers`, { name: 'C', phone: '+97455552020' }).expect(201))
      .body.id;
    const v = (
      await a('admin')
        .post(`${base()}/vehicles`, {
          customerId: c,
          plate: `TR ${uid().slice(0, 4)}`,
          make: 'Kia',
          model: 'Rio',
        })
        .expect(201)
    ).body.id;
    const job = (
      await a('admin')
        .post(`${base()}/jobs`, {
          branchId: ids.DOH,
          vehicleId: v,
          complaint: 'Pads',
          odometerIn: 1,
          fuelLevel: 'half',
          tasks: [{ description: 'Pads', estimatedHours: '1' }],
        })
        .expect(201)
    ).body.id;
    await a('admin').post(`${base()}/jobs/${job}/parts`, { partId: ids.pad, quantity: '2' }).expect(201);
    expect((await send('dohKeeper', [{ partId: ids.pad!, quantity: '1' }]).expect(422)).body.detail).toMatch(
      /Only 0.000 set of PAD can be sent/,
    );
  });
});

describe('receiving and cancelling', () => {
  it('only the receiving branch receives, at exactly the value sent; its special orders take it', async () => {
    // A WAK job waiting for pads.
    const c = (
      await a('wakManager').post(`${base()}/customers`, { name: 'W', phone: '+97455553030' }).expect(201)
    ).body.id;
    const v = (
      await a('wakManager')
        .post(`${base()}/vehicles`, {
          customerId: c,
          plate: `WK ${uid().slice(0, 4)}`,
          make: 'Kia',
          model: 'Rio',
        })
        .expect(201)
    ).body.id;
    const job = (
      await a('wakManager')
        .post(`${base()}/jobs`, {
          branchId: ids.WAK,
          vehicleId: v,
          complaint: 'Pads',
          odometerIn: 1,
          fuelLevel: 'half',
          tasks: [{ description: 'Pads', estimatedHours: '1' }],
        })
        .expect(201)
    ).body.id;
    let j = (await a('wakManager').get(`${base()}/jobs/${job}`).expect(200)).body;
    j = (
      await a('wakManager')
        .post(`${base()}/jobs/${job}/inspection`, {
          version: j.version,
          items: INSPECTION_ITEMS.map((i) => ({ key: i.key, status: 'ok' })),
        })
        .expect(200)
    ).body;
    await a('wakManager')
      .post(`${base()}/jobs/${job}/authorize`, {
        version: j.version,
        authorizedByName: 'W',
        authorizedVia: 'phone',
      })
      .expect(200);
    const o = (
      await a('wakManager')
        .post(`${base()}/jobs/${job}/parts/order`, { partId: ids.pad, quantity: '1' })
        .expect(201)
    ).body.parts[0];
    expect(o.status).toBe('ordered');

    await a('dohKeeper').post(`${base()}/transfers/${ids.t1}/receive`).expect(403);
    const r: Transfer = (await a('wakKeeper').post(`${base()}/transfers/${ids.t1}/receive`).expect(200)).body;
    expect(r).toMatchObject({ status: 'received', actions: [] });
    expect(r.lines.every((x) => x.inNumber)).toBe(true);
    expect(await stockAt(ids.oil!, 'WAK')).toMatchObject({ onHand: '10.000', value: '85.00' });
    expect(await stockAt(ids.pad!, 'WAK')).toMatchObject({
      onHand: '1.000',
      value: '40.00',
      reserved: '1.000',
    });
    expect([await ledger('1410'), await ledger('1400', 'WAK')]).toEqual(['0.00', '125.00']);
    expect((await a('wakManager').get(`${base()}/jobs/${job}/parts`).expect(200)).body.parts[0].status).toBe(
      'reserved',
    );
    await a('wakKeeper').post(`${base()}/transfers/${ids.t1}/receive`).expect(409);
    await a('dohKeeper').post(`${base()}/transfers/${ids.t1}/cancel`, { reason: 'Too late' }).expect(409);
  });

  it('the sender cancels while in transit: the stock comes back at the same value', async () => {
    const t: Transfer = (await send('dohKeeper', [{ partId: ids.oil!, quantity: '5' }]).expect(201)).body;
    expect(t.value).toBe('42.50');
    await a('wakKeeper').post(`${base()}/transfers/${t.id}/cancel`, { reason: 'Not ours' }).expect(403);
    await a('dohKeeper').post(`${base()}/transfers/${t.id}/cancel`, { reason: '' }).expect(400);
    const c: Transfer = (
      await a('dohKeeper').post(`${base()}/transfers/${t.id}/cancel`, { reason: 'Wrong branch' }).expect(200)
    ).body;
    expect(c).toMatchObject({ status: 'cancelled', actions: [] });
    expect(c.lines[0]!.backNumber).not.toBeNull();
    expect(await stockAt(ids.oil!, 'DOH')).toMatchObject({ onHand: '20.000', value: '170.00' });
    expect(await ledger('1410')).toBe('0.00');
    await a('wakKeeper').post(`${base()}/transfers/${t.id}/receive`).expect(409);
  });

  it('each branch’s stock value matches its inventory ledger; lists by status', async () => {
    for (const b of ['DOH', 'WAK']) {
      const v = (await a('admin').get(`${base()}/inventory/valuation?branchId=${ids[b]}`).expect(200)).body;
      expect(v.reconciled).toBe(true);
    }
    expect((await a('viewer').get(`${base()}/transfers`).expect(200)).body.transfers).toHaveLength(0);
    const all = (await a('viewer').get(`${base()}/transfers?status=all`).expect(200)).body.transfers;
    expect(all.map((x: { status: string }) => x.status).sort()).toEqual(['cancelled', 'received']);
  });

  it('database: transfers move forward once; lines never change; movements carry their transfer', async () => {
    await expect(
      prisma.stockTransfer.update({ where: { id: ids.t1 }, data: { status: 'in_transit' } }),
    ).rejects.toThrow(/stock_transfer_immutable/);
    await expect(
      prisma.stockTransferLine.updateMany({ where: { transferId: ids.t1 }, data: { quantity: '1' } }),
    ).rejects.toThrow(/stock_transfer_line_immutable/);
    await expect(prisma.stockTransfer.delete({ where: { id: ids.t1 } })).rejects.toThrow();
    const out = await prisma.stockMovement.findMany({ where: { companyId, kind: 'transfer_out' } });
    expect(out.every((m) => !!m.transferId)).toBe(true);
    expect(out.filter((m) => m.transferId === ids.t1)).toHaveLength(2);
  });
});
