import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { localTime } from '../src/workshop/scheduling';
import { api, bootApp, createUser, uid, type TestAuth } from './helpers';

// T-74 parts and stock: catalogue; receipts and adjustments at weighted average posted to the
// ledger; no negative stock (also under concurrency); repeated forms record once; stock value
// reconciles to the inventory account; database guarantees; branch scope.

let app: INestApplication;
let auth: TestAuth;
let prisma: PrismaClient;
let companyId: string;
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};
const base = () => `/companies/${companyId}`;
type Part = {
  id: string;
  onHand: string;
  value: string;
  averageCost: string | null;
  branches: {
    branchCode: string;
    onHand: string;
    value: string;
    averageCost: string | null;
    canReceive: boolean;
    canAdjust: boolean;
  }[];
  movements: { number: string; kind: string; value: string; journalNumber: string }[];
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
const receive = (
  t: string,
  part: string,
  branch: string,
  quantity: string,
  unitCost: string,
  key = randomUUID(),
) =>
  a(t).post(`${base()}/parts/${part}/receipts`, {
    branchId: ids[branch],
    quantity,
    unitCost,
    reference: 'DN-100',
    idempotencyKey: key,
  });
const adjust = (t: string, part: string, branch: string, body: object) =>
  a(t).post(`${base()}/parts/${part}/adjustments`, {
    branchId: ids[branch],
    idempotencyKey: randomUUID(),
    reason: 'Counted',
    ...body,
  });
const branchOf = (p: Part, code: string) => p.branches.find((b) => b.branchCode === code)!;

beforeAll(async () => {
  ({ app, auth, prisma } = await bootApp());
  const admin = await createUser(prisma, { platformAdmin: true });
  tok.admin = await auth.sign(admin.sub);
  companyId = (
    await api(app, tok.admin)
      .post('/companies', {
        code: `I${uid()}`,
        legalName: 'Stock fixture',
        baseCurrency: 'QAR',
        timezone: 'Asia/Qatar',
        initialAdminUserId: admin.id,
      })
      .expect(201)
  ).body.id;
  for (const code of ['DOH', 'WAK'])
    ids[code] = (await a('admin').post(`${base()}/branches`, { code, name: code }).expect(201)).body.id;
  await person('storekeeper', ['inventory.read', 'inventory.manage'], ids.DOH!);
  await person('counter', ['inventory.read', 'inventory.adjust'], ids.DOH!);
  await person('viewer', ['inventory.read'], ids.WAK!);
  const acct = async (code: string, type: string) =>
    (
      await a('admin')
        .post(`${base()}/accounts`, { code, name: `A${code}`, type, isPosting: true })
        .expect(201)
    ).body.id as string;
  ids.inv = await acct('1400', 'asset');
  ids.grni = await acct('2200', 'liability');
  ids.adj = await acct('5900', 'expense');
  const y = localTime(new Date(), 'Asia/Qatar').date.slice(0, 4);
  await a('admin')
    .post(`${base()}/fiscal-periods`, { name: `FY${y}`, startDate: `${y}-01-01`, endDate: `${y}-12-31` })
    .expect(201);
});

afterAll(async () => {
  await prisma.$disconnect();
  await app.close();
});

describe('catalogue', () => {
  it('company-wide stock managers add parts; SKUs are unique; SKU and unit never change', async () => {
    const body = { sku: 'oil-5w30', name: 'Engine oil 5W-30', unit: 'litre', brand: 'Mobil' };
    await a('storekeeper').post(`${base()}/parts`, body).expect(403); // branch-limited
    const p: Part = (await a('admin').post(`${base()}/parts`, body).expect(201)).body;
    expect(p).toMatchObject({ sku: 'OIL-5W30', onHand: '0.000', value: '0.00', averageCost: null });
    ids.oil = p.id;
    await a('admin').post(`${base()}/parts`, body).expect(409);
    ids.pad = (
      await a('admin')
        .post(`${base()}/parts`, { sku: 'PAD-F', name: 'Front brake pads', unit: 'set' })
        .expect(201)
    ).body.id;
    const list = (await a('viewer').get(`${base()}/parts?q=oil`).expect(200)).body;
    expect(list.parts.map((x: { sku: string }) => x.sku)).toEqual(['OIL-5W30']);
    expect(list.canCreate).toBe(false);
    await expect(prisma.part.update({ where: { id: ids.oil }, data: { sku: 'X' } })).rejects.toThrow(
      /part_identity_immutable/,
    );
  });
});

describe('receipts and adjustments', () => {
  it('nothing moves until the accountant chooses the stock accounts', async () => {
    expect((await receive('storekeeper', ids.oil!, 'DOH', '10', '8').expect(422)).body.detail).toMatch(
      /inventory account/,
    );
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
        stockAdjustmentAccountId: ids.adj,
      })
      .expect(200);
  });

  it('receipts at cost move the weighted average and post Dr inventory, Cr goods received', async () => {
    await receive('counter', ids.oil!, 'DOH', '10', '8').expect(403);
    await receive('storekeeper', ids.oil!, 'WAK', '10', '8').expect(404);
    await a('storekeeper')
      .post(`${base()}/parts/${ids.oil}/receipts`, {
        branchId: ids.DOH,
        quantity: '1',
        unitCost: '1',
        reference: '',
        idempotencyKey: randomUUID(),
      })
      .expect(400);
    const key = randomUUID();
    await receive('storekeeper', ids.oil!, 'DOH', '20', '8.20', key).expect(201);
    const again: Part = (await receive('storekeeper', ids.oil!, 'DOH', '20', '8.20', key).expect(201)).body;
    expect(again.movements).toHaveLength(1); // the same form twice records once
    const p: Part = (await receive('storekeeper', ids.oil!, 'DOH', '10', '9.10').expect(201)).body;
    expect(branchOf(p, 'DOH')).toMatchObject({
      onHand: '30.000',
      value: '255.00',
      averageCost: '8.5000',
      canReceive: true,
    });
    expect(p.movements[0]).toMatchObject({ kind: 'receipt', value: '91.00' });
    const j = await prisma.journal.findFirstOrThrow({
      where: { sourceType: 'stock', companyId },
      orderBy: { postedAt: 'desc' },
      include: { lines: { include: { account: true }, orderBy: { lineNo: 'asc' } } },
    });
    expect(j.lines.map((l) => [l.account.code, l.debit.toFixed(2), l.credit.toFixed(2)])).toEqual([
      ['1400', '91.00', '0.00'],
      ['2200', '0.00', '91.00'],
    ]);
  });

  it('counted differences: out at the average, in at a given cost, always with a reason; never below zero', async () => {
    await adjust('storekeeper', ids.oil!, 'DOH', { direction: 'out', quantity: '1' }).expect(403); // no adjust permission
    await adjust('counter', ids.oil!, 'DOH', { direction: 'out', quantity: '1', reason: '' }).expect(400);
    await adjust('counter', ids.oil!, 'DOH', { direction: 'in', quantity: '1' }).expect(400); // found stock needs a cost
    expect(
      (await adjust('counter', ids.oil!, 'DOH', { direction: 'out', quantity: '31' }).expect(422)).body
        .detail,
    ).toMatch(/Only 30.000 on hand/);
    let p: Part = (
      await adjust('counter', ids.oil!, 'DOH', {
        direction: 'out',
        quantity: '1.5',
        reason: 'Spilled',
      }).expect(201)
    ).body;
    expect(branchOf(p, 'DOH')).toMatchObject({ onHand: '28.500', value: '242.25' }); // 1.5 × 8.5 = 12.75
    p = (
      await adjust('counter', ids.oil!, 'DOH', {
        direction: 'in',
        quantity: '0.5',
        unitCost: '8.5',
        reason: 'Found a part bottle',
      }).expect(201)
    ).body;
    expect(branchOf(p, 'DOH')).toMatchObject({ onHand: '29.000', value: '246.50' });
    const out = await prisma.journal.findFirstOrThrow({
      where: { companyId, description: { contains: 'Spilled' } },
      include: { lines: { include: { account: true }, orderBy: { lineNo: 'asc' } } },
    });
    expect(out.lines.map((l) => [l.account.code, l.debit.toFixed(2), l.credit.toFixed(2)])).toEqual([
      ['5900', '12.75', '0.00'],
      ['1400', '0.00', '12.75'],
    ]);
  });

  it('two people taking the last units at the same moment: one succeeds, stock stays at zero', async () => {
    await receive('storekeeper', ids.pad!, 'DOH', '1', '120').expect(201);
    const r = await Promise.all([
      adjust('counter', ids.pad!, 'DOH', { direction: 'out', quantity: '1', reason: 'Damaged box' }),
      adjust('counter', ids.pad!, 'DOH', { direction: 'out', quantity: '1', reason: 'Damaged box' }),
    ]);
    expect(r.map((x) => x.status).sort()).toEqual([201, 422]);
    const s = await prisma.stock.findUniqueOrThrow({
      where: { branchId_partId: { branchId: ids.DOH!, partId: ids.pad! } },
    });
    expect([s.onHand.toFixed(3), s.value.toFixed(2)]).toEqual(['0.000', '0.00']);
  });
});

describe('valuation and guarantees', () => {
  it('stock value reconciles to the inventory account', async () => {
    const v = (await a('admin').get(`${base()}/inventory/valuation`).expect(200)).body;
    expect(v).toMatchObject({ totalValue: '246.50', ledgerBalance: '246.50', reconciled: true });
    expect(v.rows).toEqual([
      expect.objectContaining({ sku: 'OIL-5W30', onHand: '29.000', averageCost: '8.5000', value: '246.50' }),
    ]);
    const wak = (await a('viewer').get(`${base()}/inventory/valuation`).expect(200)).body;
    expect(wak).toMatchObject({ totalValue: '0.00', rows: [] });
    await a('viewer').get(`${base()}/inventory/valuation?branchId=${ids.DOH}`).expect(404);
  });

  it('balances change only with a movement; movements never change; no negative stock', async () => {
    await expect(
      prisma.$executeRaw`UPDATE inventory.stock SET on_hand = 100 WHERE part_id = ${ids.oil}::uuid`,
    ).rejects.toThrow(/stock_change_without_movement/);
    await expect(
      prisma.$executeRaw`UPDATE inventory.stock_movement SET value = 1 WHERE part_id = ${ids.oil}::uuid`,
    ).rejects.toThrow();
    await expect(
      prisma.$executeRaw`DELETE FROM inventory.stock WHERE part_id = ${ids.oil}::uuid`,
    ).rejects.toThrow(/stock_immutable/);
    await expect(
      prisma.$executeRaw`INSERT INTO inventory.stock (company_id, branch_id, part_id, on_hand, value) VALUES (${companyId}::uuid, ${ids.WAK}::uuid, ${ids.oil}::uuid, 5, 10)`,
    ).rejects.toThrow(/stock_starts_empty/);
  });
});
