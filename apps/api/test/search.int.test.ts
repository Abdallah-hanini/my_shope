import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { api, bootApp, createUser, uid, type TestAuth } from './helpers';

// WEB-237 global search: permission and branch scope per record type, Arabic variants, literal
// matching of LIKE wildcards, ranking and limits.

let app: INestApplication;
let auth: TestAuth;
let prisma: PrismaClient;
let token: string;
let companyId: string;
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};

type Group = { type: string; items: { id: string; code: string | null; name: string }[]; more: boolean };
const search = async (q: string, t = token, extra = '') =>
  (
    await api(app, t)
      .get(`/companies/${companyId}/search?q=${encodeURIComponent(q)}${extra}`)
      .expect(200)
  ).body as { query: string; groups: Group[] };
const group = (r: { groups: Group[] }, type: string) => r.groups.find((g) => g.type === type);
const names = (r: { groups: Group[] }, type: string) =>
  group(r, type)?.items.map((i) => i.code ?? i.name) ?? [];

async function role(code: string, permissions: string[]) {
  return (
    await api(app, token)
      .post(`/companies/${companyId}/roles`, { code: `${code}-${uid()}`, name: code, permissions })
      .expect(201)
  ).body.id as string;
}
async function member(displayName: string, roleId: string, branchId: string | null) {
  const u = await createUser(prisma);
  await prisma.user.update({ where: { id: u.id }, data: { displayName, email: `${uid()}@shop.invalid` } });
  await api(app, token)
    .post(`/companies/${companyId}/role-assignments`, { userId: u.id, roleId, branchId })
    .expect(201);
  return { id: u.id, token: await auth.sign(u.sub) };
}

beforeAll(async () => {
  ({ app, auth, prisma } = await bootApp());
  const admin = await createUser(prisma, { platformAdmin: true });
  token = await auth.sign(admin.sub);
  const c = api(app, token);
  companyId = (
    await c
      .post('/companies', {
        code: `Q${uid()}`,
        legalName: 'Search fixture',
        baseCurrency: 'QAR',
        timezone: 'Asia/Qatar',
        initialAdminUserId: admin.id,
      })
      .expect(201)
  ).body.id;
  for (const [k, code, name, nameAr] of [
    ['DOH', 'DOH', 'Doha workshop', 'ورشة الدوحة'],
    ['WAK', 'WAK', 'Wakrah parts', 'قطع الوكرة'],
  ] as const) {
    ids[k] = (await c.post(`/companies/${companyId}/branches`, { code, name, nameAr }).expect(201)).body.id;
  }
  for (const [k, code, name, nameAr, type] of [
    ['CASH', '1100', 'Cash box', 'الصندوق', 'asset'],
    ['BANK', '1200', 'Bank', null, 'asset'],
    ['SVC', '4100', 'Service revenue', 'إيرادات الخدمة', 'revenue'],
    ['C11', '11', 'Cash equivalents', null, 'asset'],
  ] as const) {
    ids[k] = (
      await c
        .post(`/companies/${companyId}/accounts`, {
          code,
          name,
          nameAr: nameAr ?? undefined,
          type,
          isPosting: true,
        })
        .expect(201)
    ).body.id;
  }
  await c
    .post(`/companies/${companyId}/fiscal-periods`, {
      name: 'FY2026',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
    })
    .expect(201);
  const post = async (branchId: string | null, description: string) =>
    (
      await c
        .post(
          `/companies/${companyId}/journals`,
          {
            postingDate: '2026-03-01',
            description,
            ...(branchId ? { branchId } : {}),
            lines: [
              { accountId: ids.CASH, debit: '10', credit: '0' },
              { accountId: ids.SVC, debit: '0', credit: '10' },
            ],
          },
          { 'Idempotency-Key': randomUUID() },
        )
        .expect(201)
    ).body as { id: string; number: string };
  ids.J_DOH = (await post(ids.DOH!, 'Brake pads 50% off')).id;
  ids.J_WAK = (await post(ids.WAK!, 'Tyre fitting for أحمد')).id;
  ids.J_CO = (await post(null, 'Cash count adjustment')).id;

  const viewer = await role('doh-viewer', [
    'accounting.journal.read',
    'org.branch.read',
    'iam.assignment.read',
  ]);
  const doh = await member('Sara Doha', viewer, ids.DOH!);
  ids.SARA = doh.id;
  tok.doh = doh.token;
  ids.OMAR = (await member('Omar Wakrah', viewer, ids.WAK!)).id;
  tok.bare = (
    await member('Basic Person', await role('accounts-only', ['accounting.account.read']), null)
  ).token;
});

afterAll(async () => {
  await prisma.$disconnect();
  await app.close();
});

describe('global search', () => {
  it('finds each record type the caller may read, in a fixed order', async () => {
    const r = await search('cash');
    expect(r.groups.map((g) => g.type)).toEqual(['journal', 'account', 'branch', 'period', 'user']);
    expect(names(r, 'journal')).toHaveLength(1);
    expect(group(r, 'journal')!.items[0]).toMatchObject({ id: ids.J_CO, name: 'Cash count adjustment' });
    expect(names(r, 'account')).toEqual(['11', '1100']);
    expect(group(r, 'branch')!.items).toEqual([]);
  });

  it('ranks code prefixes first and matches codes, names and journal numbers', async () => {
    expect(names(await search('11'), 'account')).toEqual(['11', '1100']);
    const num = (await prisma.journal.findUniqueOrThrow({ where: { id: ids.J_DOH } })).number;
    expect(group(await search(num), 'journal')!.items[0]!.id).toBe(ids.J_DOH);
    expect(names(await search('fy20'), 'period')).toEqual(['FY2026']);
    expect(names(await search('sara'), 'user')).toEqual(['Sara Doha']);
  });

  it('tolerates Arabic spelling variants (ة/ه, أ/ا) and searches Arabic names', async () => {
    expect(names(await search('ورشه'), 'branch')).toEqual(['DOH']);
    expect(group(await search('احمد'), 'journal')!.items[0]!.id).toBe(ids.J_WAK);
    expect(names(await search('الخدمه'), 'account')).toEqual(['4100']);
  });

  it('matches %, _ and \\ literally instead of as wildcards', async () => {
    expect(names(await search('50%'), 'journal')).toHaveLength(1);
    expect(names(await search('%%'), 'journal')).toEqual([]);
    expect(names(await search('__'), 'account')).toEqual([]);
  });

  it('applies the per-type limit and reports that more exist', async () => {
    const r = await search('1', token, '&limit=1').catch(() => null);
    expect(r).toBeNull(); // one character is refused (see below); use two
    const two = await search('00', token, '&limit=1');
    expect(group(two, 'account')).toMatchObject({ more: true });
    expect(group(two, 'account')!.items).toHaveLength(1);
  });

  it('branch-limited staff find only their branch, its journals and its people', async () => {
    const r = await search('a', tok.doh).catch(() => null);
    expect(r).toBeNull();
    const all = await search('ra', tok.doh); // "Brake", "Tyre", "Sara", "Omar Wakrah", "Wakrah parts"
    expect(all.groups.map((g) => g.type)).toEqual(['journal', 'branch', 'user']);
    expect(group(all, 'journal')!.items.map((i) => i.id)).toEqual([ids.J_DOH]);
    expect(names(all, 'branch')).toEqual([]);
    expect(names(all, 'user')).toEqual(['Sara Doha']);
    expect(names(await search('cash count', tok.doh), 'journal')).toEqual([]); // company-level journal
    expect(names(await search('doha', tok.doh), 'branch')).toEqual(['DOH']);
  });

  it('leaves out types the caller cannot read (no hint that they exist)', async () => {
    const r = await search('cash', tok.bare);
    expect(r.groups.map((g) => g.type)).toEqual(['account']);
  });

  it('validates the query and hides other companies', async () => {
    await api(app, token).get(`/companies/${companyId}/search?q=a`).expect(400);
    await api(app, token).get(`/companies/${companyId}/search`).expect(400);
    await api(app, token)
      .get(`/companies/${companyId}/search?q=${'x'.repeat(101)}`)
      .expect(400);
    const outsider = await auth.sign((await createUser(prisma)).sub);
    await api(app, outsider).get(`/companies/${companyId}/search?q=cash`).expect(404);
    await api(app, token).get(`/companies/${randomUUID()}/search?q=cash`).expect(404);
    await api(app, token).get('/companies/not-a-uuid/search?q=cash').expect(404);
    await api(app).get(`/companies/${companyId}/search?q=cash`).expect(401);
  });
});
