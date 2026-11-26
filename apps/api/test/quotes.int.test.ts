import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { localTime } from '../src/workshop/scheduling';
import { api, bootApp, createUser, uid, type TestAuth } from './helpers';

// WMS-005 quotes: priced from the branch labour rate and the accountant's tax, price changes and
// discounts with reasons, the owner's approval above the limit (never one's own), issue freezes
// and numbers, the customer's decision, revisions, database guarantees, scope.

const TZ = 'Asia/Qatar';
let app: INestApplication;
let auth: TestAuth;
let prisma: PrismaClient;
let companyId: string;
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};
const base = () => `/companies/${companyId}`;
const today = localTime(new Date(), TZ).date;
type Q = {
  id: string;
  revision: number;
  number: string | null;
  status: string;
  version: number;
  discountNeedsApproval: boolean;
  subtotal: string;
  discountAmount: string;
  netAmount: string;
  taxAmount: string;
  total: string;
  taxCode: string | null;
  lines: { taskId: string; amount: string; overrideAmount: string | null }[];
  actions: string[];
};
type Quotes = { canCreate: boolean; labourRate: string | null; quotes: Q[] };

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
  ids[name] = u.id;
  tok[name] = await auth.sign(u.sub);
}
const quotes = async (t = 'advisor', job = ids.job): Promise<Quotes> =>
  (await api(app, tok[t]).get(`${base()}/jobs/${job}/quotes`).expect(200)).body;
const draft = async () => (await quotes()).quotes.find((q) => q.status === 'draft')!;
const patch = (t: string, q: Q, body: object) =>
  api(app, tok[t]).patch(`${base()}/quotes/${q.id}`, {
    version: q.version,
    discountPct: '0',
    lines: [],
    ...body,
  });
const post = (t: string, q: Q, op: string, body: object = {}) =>
  api(app, tok[t]).post(`${base()}/quotes/${q.id}/${op}`, { version: q.version, ...body });

async function newJob(branch: string, manager = 'advisor') {
  return (
    await api(app, tok[manager])
      .post(`${base()}/jobs`, {
        branchId: ids[branch],
        vehicleId: ids[`vehicle${branch}`],
        complaint: 'Brakes',
        odometerIn: 100,
        fuelLevel: 'half',
        tasks: [
          { description: 'Front pads', estimatedHours: '1.5' },
          { description: 'Road test', estimatedHours: '0.5' },
        ],
      })
      .expect(201)
  ).body.id as string;
}

beforeAll(async () => {
  ({ app, auth, prisma } = await bootApp());
  const admin = await createUser(prisma, { platformAdmin: true });
  await prisma.user.update({ where: { id: admin.id }, data: { displayName: 'owner' } });
  ids.admin = admin.id;
  tok.admin = await auth.sign(admin.sub);
  companyId = (
    await api(app, tok.admin)
      .post('/companies', {
        code: `Q${uid()}`,
        legalName: 'Quotes fixture',
        baseCurrency: 'QAR',
        timezone: TZ,
        initialAdminUserId: admin.id,
      })
      .expect(201)
  ).body.id;
  for (const code of ['DOH', 'WAK'])
    ids[code] = (
      await api(app, tok.admin).post(`${base()}/branches`, { code, name: code }).expect(201)
    ).body.id;
  const mgr = [
    'org.company.read',
    'crm.customer.read',
    'crm.customer.manage',
    'workshop.job.read',
    'workshop.job.manage',
  ];
  await person('advisor', mgr, ids.DOH!);
  await person('tech', ['workshop.job.read', 'workshop.job.work'], ids.DOH!);
  await person('wak', mgr, ids.WAK!);
  for (const [b, m] of [
    ['DOH', 'advisor'],
    ['WAK', 'wak'],
  ] as const) {
    const c = (
      await api(app, tok[m])
        .post(`${base()}/customers`, { name: `C${b}`, phone: '+97455550707' })
        .expect(201)
    ).body.id;
    ids[`vehicle${b}`] = (
      await api(app, tok[m])
        .post(`${base()}/vehicles`, {
          customerId: c,
          plate: `QT ${b}${uid().slice(0, 3)}`,
          make: 'Kia',
          model: 'Rio',
        })
        .expect(201)
    ).body.id;
  }
  // The owner's prices and the accountant's tax (test values, not real rates).
  const a = api(app, tok.admin);
  await a
    .post(`${base()}/branches/${ids.DOH}/labour-rates`, { rate: '150', effectiveFrom: today })
    .expect(201);
  await a.put(`${base()}/pricing/settings`, { version: 0, managerDiscountLimitPct: '10' }).expect(200);
  const vat = (await a.post(`${base()}/tax/codes`, { code: 'T5', name: 'Test 5 %' }).expect(201)).body
    .codes[0].id;
  await a.post(`${base()}/tax/codes/${vat}/rates`, { rate: '5', effectiveFrom: today }).expect(201);
  await a
    .put(`${base()}/tax/settings`, { version: 0, pricesIncludeTax: false, defaultTaxCodeId: vat })
    .expect(200);
  ids.job = await newJob('DOH');
});

afterAll(async () => {
  await prisma.$disconnect();
  await app.close();
});

describe('preparing a quote', () => {
  it('managers start a draft priced at hours × the branch rate, with the accountant’s tax', async () => {
    const wakJob = await newJob('WAK', 'wak');
    expect((await api(app, tok.wak).post(`${base()}/jobs/${wakJob}/quotes`).expect(422)).body.detail).toMatch(
      /labour rate/,
    );
    await api(app, tok.tech).post(`${base()}/jobs/${ids.job}/quotes`).expect(403);
    const r: Quotes = (await api(app, tok.advisor).post(`${base()}/jobs/${ids.job}/quotes`).expect(201)).body;
    expect(r).toMatchObject({ canCreate: false, labourRate: '150.00' });
    expect(r.quotes[0]).toMatchObject({
      revision: 1,
      status: 'draft',
      number: null,
      taxCode: 'T5',
      subtotal: '300.00',
      discountAmount: '0.00',
      taxAmount: '15.00',
      total: '315.00',
      actions: ['edit', 'discard', 'issue'],
    });
    expect(r.quotes[0]!.lines.map((l) => l.amount)).toEqual(['225.00', '75.00']);
    await api(app, tok.advisor).post(`${base()}/jobs/${ids.job}/quotes`).expect(409);
    expect((await quotes('tech')).quotes[0]!.actions).toEqual([]);
  });

  it('price changes and discounts need reasons; totals follow the rules', async () => {
    let q = await draft();
    const road = q.lines[1]!.taskId;
    await patch('advisor', q, { discountPct: '5' }).expect(400);
    await patch('advisor', q, { lines: [{ taskId: road, overrideAmount: '50', overrideReason: '' }] }).expect(
      400,
    );
    const r: Quotes = (
      await patch('advisor', q, {
        discountPct: '5',
        discountReason: 'Regular customer',
        lines: [{ taskId: road, overrideAmount: '50', overrideReason: 'Short test drive' }],
      }).expect(200)
    ).body;
    q = r.quotes[0]!;
    expect(q).toMatchObject({
      subtotal: '275.00',
      discountAmount: '13.75',
      netAmount: '261.25',
      taxAmount: '13.06',
      total: '274.31',
    });
    expect(q.lines[1]).toMatchObject({ overrideAmount: '50.00', amount: '50.00' });
    await patch('advisor', { ...q, version: q.version - 1 }, {}).expect(409);
  });

  it('above the managers’ limit the owner approves the discount, never their own', async () => {
    let q = await draft();
    q = (await patch('advisor', q, { discountPct: '15', discountReason: 'Fleet customer' }).expect(200)).body
      .quotes[0];
    expect(q.discountNeedsApproval).toBe(true);
    expect((await post('advisor', q, 'issue').expect(422)).body.detail).toMatch(/owner must approve/);
    await post('advisor', q, 'approve-discount').expect(403);
    // The owner sets a discount and cannot approve it themselves.
    q = (await patch('admin', q, { discountPct: '20', discountReason: 'Owner’s friend' }).expect(200)).body
      .quotes[0];
    expect(q.actions).not.toContain('approveDiscount');
    expect((await post('admin', q, 'approve-discount').expect(403)).body.detail).toMatch(
      /another owner-level person/,
    );
    q = (await patch('advisor', q, { discountPct: '15', discountReason: 'Fleet customer' }).expect(200)).body
      .quotes[0];
    q = (await quotes('admin')).quotes[0]!;
    expect(q.actions).toContain('approveDiscount');
    q = (await post('admin', q, 'approve-discount').expect(200)).body.quotes[0];
    expect(q.discountNeedsApproval).toBe(false);
    await expect(
      prisma.$executeRaw`UPDATE workshop.quote SET discount_approved_by = discount_set_by WHERE id = ${q.id}::uuid`,
    ).rejects.toThrow(/quote_discount_not_self_approved/);
  });
});

describe('issuing and the customer’s decision', () => {
  it('issuing numbers and freezes the quote (API and database)', async () => {
    const q = await draft();
    const r: Quotes = (await post('advisor', q, 'issue').expect(200)).body;
    const issued = r.quotes[0]!;
    expect(issued).toMatchObject({ status: 'issued', revision: 1, actions: ['decide'] });
    expect(issued.number).toMatch(/^Q-\d{4}-000001$/);
    expect(r.canCreate).toBe(true);
    await patch('advisor', issued, {}).expect(409);
    await expect(
      prisma.$executeRaw`UPDATE workshop.quote SET total = 1 WHERE id = ${issued.id}::uuid`,
    ).rejects.toThrow(/quote_immutable|quote_totals_consistent/);
    await expect(
      prisma.$executeRaw`UPDATE workshop.quote_line SET amount = 1 WHERE quote_id = ${issued.id}::uuid`,
    ).rejects.toThrow(/quote_line_immutable/);
    await expect(
      prisma.$executeRaw`DELETE FROM workshop.quote WHERE id = ${issued.id}::uuid`,
    ).rejects.toThrow(/quote_immutable/);
    const job = (await api(app, tok.advisor).get(`${base()}/jobs/${ids.job}`).expect(200)).body;
    expect(job.events.at(-1)).toMatchObject({
      kind: 'quote_issued',
      note: `${issued.number} · ${issued.total} QAR`,
    });
  });

  it('a new revision supersedes an undecided quote; the customer approves or declines', async () => {
    let r: Quotes = (await api(app, tok.advisor).post(`${base()}/jobs/${ids.job}/quotes`).expect(201)).body;
    const rev2 = r.quotes[0]!;
    expect(rev2).toMatchObject({ revision: 2, status: 'draft', discountNeedsApproval: true }); // the discount needs approval again
    r = (await patch('advisor', rev2, { discountPct: '0' }).expect(200)).body;
    r = (await post('advisor', r.quotes[0]!, 'issue').expect(200)).body;
    expect(r.quotes.map((q) => [q.revision, q.status])).toEqual([
      [2, 'issued'],
      [1, 'superseded'],
    ]);
    expect(r.quotes[0]!.total).toBe('288.75'); // 275 + 5 % tax
    const q = r.quotes[0]!;
    await post('tech', q, 'decision', {
      decision: 'approve',
      authorizedByName: 'C',
      authorizedVia: 'phone',
    }).expect(403);
    await post('advisor', q, 'decision', { decision: 'decline', reason: '' }).expect(400);
    r = (
      await post('advisor', q, 'decision', {
        decision: 'approve',
        authorizedByName: 'CDOH',
        authorizedVia: 'phone',
      }).expect(200)
    ).body;
    expect(r.quotes[0]).toMatchObject({ status: 'approved', actions: [] });
    await post('advisor', r.quotes[0]!, 'decision', { decision: 'decline', reason: 'Changed mind' }).expect(
      409,
    );
    const job = (await api(app, tok.advisor).get(`${base()}/jobs/${ids.job}`).expect(200)).body;
    expect(job.events.at(-1)).toMatchObject({ kind: 'quote_approved' });
  });

  it('drafts can be discarded; closed jobs take no new quote; other branches see nothing', async () => {
    let r: Quotes = (await api(app, tok.advisor).post(`${base()}/jobs/${ids.job}/quotes`).expect(201)).body;
    r = (await post('advisor', r.quotes[0]!, 'discard').expect(200)).body;
    expect(r.quotes.map((q) => q.status)).toEqual(['approved', 'superseded']);
    await api(app, tok.wak).get(`${base()}/jobs/${ids.job}/quotes`).expect(404);
    const j = (await api(app, tok.advisor).get(`${base()}/jobs/${ids.job}`).expect(200)).body;
    await api(app, tok.advisor)
      .post(`${base()}/jobs/${ids.job}/cancel`, { version: j.version, reason: 'Customer left' })
      .expect(200);
    await api(app, tok.advisor).post(`${base()}/jobs/${ids.job}/quotes`).expect(409);
  });
});
