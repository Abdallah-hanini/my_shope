import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { COMPANY_ADMIN_ROLE } from '@erp/validation';
import sharp from 'sharp';
import request from 'supertest';
import { localTime } from '../src/workshop/scheduling';
import { api, bootApp, createUser, uid, type TestAuth } from './helpers';

// D-05 settings: the accountant's tax set-up (no built-in rates, dated rates that never change
// once in effect), labour rates per branch and the discount limit (owner), and the letterhead.

const TZ = 'Asia/Qatar';
let app: INestApplication;
let auth: TestAuth;
let prisma: PrismaClient;
let companyId: string;
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};
const base = () => `/companies/${companyId}`;
const today = localTime(new Date(), TZ).date;
const future = '2099-01-01';
type Tax = {
  version: number;
  canManage: boolean;
  defaultTaxCodeId: string | null;
  codes: {
    id: string;
    code: string;
    version: number;
    active: boolean;
    currentRatePct: string | null;
    rates: { id: string; value: string; effectiveFrom: string; canRemove: boolean }[];
  }[];
};

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
  tok[name] = await auth.sign(u.sub);
}
const tax = async (t = 'admin'): Promise<Tax> =>
  (await api(app, tok[t]).get(`${base()}/tax`).expect(200)).body;

beforeAll(async () => {
  ({ app, auth, prisma } = await bootApp());
  const admin = await createUser(prisma, { platformAdmin: true });
  tok.admin = await auth.sign(admin.sub);
  companyId = (
    await api(app, tok.admin)
      .post('/companies', {
        code: `T${uid()}`,
        legalName: 'Settings fixture',
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
  await person('advisor', ['org.company.read', 'workshop.job.read', 'workshop.job.manage'], ids.DOH!);
  await person('branchAccountant', ['org.company.read', 'accounting.tax.manage'], ids.DOH!);
  await person('wakOwner', ['org.company.read', 'workshop.job.read', 'workshop.pricing.manage'], ids.WAK!);
  const acct = (code: string, type: string) =>
    api(app, tok.admin).post(`${base()}/accounts`, { code, name: code, type, isPosting: true }).expect(201);
  ids.taxPayable = (await acct('2100', 'liability')).body.id;
  ids.cash = (await acct('1100', 'asset')).body.id;
});

afterAll(async () => {
  await prisma.$disconnect();
  await app.close();
});

describe('tax set-up (accountant)', () => {
  it('starts empty: no tax until the accountant sets it up; only a company-wide accountant may', async () => {
    expect(COMPANY_ADMIN_ROLE.permissions).toEqual(
      expect.arrayContaining(['accounting.tax.manage', 'org.company.manage', 'workshop.pricing.manage']),
    );
    const t = await tax();
    expect(t).toMatchObject({ version: 0, defaultTaxCodeId: null, codes: [], canManage: true });
    expect((await tax('advisor')).canManage).toBe(false);
    const code = { code: 'vat-std', name: 'VAT standard', outputAccountId: ids.taxPayable };
    await api(app, tok.advisor).post(`${base()}/tax/codes`, code).expect(403);
    await api(app, tok.branchAccountant).post(`${base()}/tax/codes`, code).expect(403); // branch-limited
    expect(
      (
        await api(app, tok.admin)
          .post(`${base()}/tax/codes`, { ...code, outputAccountId: ids.cash })
          .expect(422)
      ).body.detail,
    ).toMatch(/liability/);
    const r: Tax = (await api(app, tok.admin).post(`${base()}/tax/codes`, code).expect(201)).body;
    expect(r.codes[0]).toMatchObject({ code: 'VAT-STD', currentRatePct: null, rates: [] });
    ids.vat = r.codes[0]!.id;
    await api(app, tok.admin).post(`${base()}/tax/codes`, code).expect(409);
    await api(app, tok.admin).post(`${base()}/tax/codes`, { code: 'EXEMPT', name: 'Exempt' }).expect(201);
  });

  it('rates apply from a date; past rates cannot be added, rates in effect never change', async () => {
    const add = (rate: string, effectiveFrom: string) =>
      api(app, tok.admin).post(`${base()}/tax/codes/${ids.vat}/rates`, { rate, effectiveFrom });
    expect((await add('5', '2020-01-01').expect(422)).body.detail).toMatch(/today or later/);
    await add('101', today).expect(400);
    await add('0', today).expect(201);
    const t: Tax = (await add('5', future).expect(201)).body;
    const vat = t.codes.find((c) => c.code === 'VAT-STD')!;
    expect(vat.currentRatePct).toBe('0.0000');
    expect(vat.rates.map((r) => [r.value, r.effectiveFrom, r.canRemove])).toEqual([
      ['5.0000', future, true],
      ['0.0000', today, false],
    ]);
    await add('6', future).expect(409);
    const remove = (rateId: string) =>
      api(app, tok.admin).delete(`${base()}/tax/codes/${ids.vat}/rates/${rateId}`);
    expect((await remove(vat.rates[1]!.id).expect(409)).body.detail).toMatch(/has started/);
    expect(
      (await remove(vat.rates[0]!.id).expect(200)).body.codes.find(
        (c: { code: string }) => c.code === 'VAT-STD',
      ).rates,
    ).toHaveLength(1);
    await expect(
      prisma.$executeRaw`DELETE FROM accounting.tax_rate WHERE id = ${vat.rates[1]!.id}::uuid`,
    ).rejects.toThrow(/dated_rate_in_effect/);
    await expect(
      prisma.$executeRaw`UPDATE accounting.tax_rate SET rate_pct = 9 WHERE id = ${vat.rates[1]!.id}::uuid`,
    ).rejects.toThrow(/dated_rate_immutable/);
  });

  it('settings choose the default tax and whether prices include it; the default stays active', async () => {
    const set = (body: object) => api(app, tok.admin).put(`${base()}/tax/settings`, body);
    const t: Tax = (
      await set({
        version: 0,
        pricesIncludeTax: false,
        defaultTaxCodeId: ids.vat,
        taxRegistrationNo: 'TRN-123',
      }).expect(200)
    ).body;
    expect(t).toMatchObject({ version: 1, defaultTaxCodeId: ids.vat, pricesIncludeTax: false });
    await set({ version: 0, pricesIncludeTax: true, defaultTaxCodeId: null }).expect(409);
    const vat = t.codes.find((c) => c.code === 'VAT-STD')!;
    expect(
      (
        await api(app, tok.admin)
          .patch(`${base()}/tax/codes/${ids.vat}`, {
            version: vat.version,
            name: 'VAT',
            active: false,
            outputAccountId: ids.taxPayable,
          })
          .expect(409)
      ).body.detail,
    ).toMatch(/default tax/);
    await expect(prisma.taxCode.update({ where: { id: ids.vat }, data: { active: false } })).rejects.toThrow(
      /tax_code_is_default/,
    );
    await api(app, tok.branchAccountant)
      .put(`${base()}/tax/settings`, { version: 1, pricesIncludeTax: true, defaultTaxCodeId: null })
      .expect(403);
  });
});

describe('labour rates and the discount limit (owner)', () => {
  it('rates per branch from a date; branch owners only for their branch; the limit is company-wide', async () => {
    const add = (t: string, branch: string, rate: string, effectiveFrom = today) =>
      api(app, tok[t]).post(`${base()}/branches/${ids[branch]}/labour-rates`, { rate, effectiveFrom });
    await add('advisor', 'DOH', '150').expect(403);
    await add('wakOwner', 'DOH', '150').expect(404); // not their branch
    await add('admin', 'DOH', '0').expect(400);
    await add('admin', 'DOH', '150', '2020-01-01').expect(422);
    await add('admin', 'DOH', '150').expect(201);
    await add('wakOwner', 'WAK', '120.50').expect(201);
    const p = (await api(app, tok.advisor).get(`${base()}/pricing`).expect(200)).body;
    expect(p).toMatchObject({
      currency: 'QAR',
      managerDiscountLimitPct: '0.0000',
      version: 0,
      canManageSettings: false,
    });
    expect(p.branches).toEqual([
      expect.objectContaining({ branchCode: 'DOH', currentRate: '150.00', canManage: false }),
    ]);
    const set = (t: string, body: object) => api(app, tok[t]).put(`${base()}/pricing/settings`, body);
    await set('wakOwner', { version: 0, managerDiscountLimitPct: '10' }).expect(403);
    await set('admin', { version: 0, managerDiscountLimitPct: '100.5' }).expect(400);
    expect(
      (await set('admin', { version: 0, managerDiscountLimitPct: '10' }).expect(200)).body,
    ).toMatchObject({
      managerDiscountLimitPct: '10.0000',
      version: 1,
      canManageSettings: true,
    });
    const rate = (await prisma.labourRate.findFirstOrThrow({ where: { branchId: ids.DOH } })).id;
    await api(app, tok.admin).delete(`${base()}/labour-rates/${rate}`).expect(409);
  });
});

describe('letterhead', () => {
  it('company details and a logo, changed by company administrators only', async () => {
    const pr = (await api(app, tok.advisor).get(`${base()}/profile`).expect(200)).body;
    expect(pr).toMatchObject({
      legalName: 'Settings fixture',
      crNumber: null,
      logoVersion: null,
      taxRegistrationNo: 'TRN-123',
      canManage: false,
    });
    const body = {
      version: pr.version,
      crNumber: '12345',
      address: 'Street 1, Doha',
      addressAr: 'شارع 1، الدوحة',
      phone: '+974 4444 0000',
    };
    await api(app, tok.advisor).put(`${base()}/profile`, body).expect(403);
    const saved = (await api(app, tok.admin).put(`${base()}/profile`, body).expect(200)).body;
    expect(saved).toMatchObject({ crNumber: '12345', phone: '+974 4444 0000', version: pr.version + 1 });
    await api(app, tok.admin).put(`${base()}/profile`, body).expect(409);

    const upload = (t: string, buf: Buffer, name: string) =>
      request(app.getHttpServer())
        .put(`/api/v1${base()}/profile/logo`)
        .set('Authorization', `Bearer ${tok[t]}`)
        .attach('file', buf, name);
    const big = await sharp({ create: { width: 1600, height: 400, channels: 3, background: '#1d4ed8' } })
      .jpeg()
      .withMetadata({ exif: { IFD0: { Copyright: 'secret-maker' } } })
      .toBuffer();
    await upload('advisor', big, 'logo.jpg').expect(403);
    expect(
      (
        await upload('admin', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'logo.svg').expect(
          422,
        )
      ).body.detail,
    ).toMatch(/JPEG, PNG or WebP/);
    const withLogo = (await upload('admin', big, 'logo.jpg').expect(200)).body;
    expect(withLogo.logoVersion).toBeTruthy();
    const png = await request(app.getHttpServer())
      .get(`/api/v1${base()}/profile/logo`)
      .set('Authorization', `Bearer ${tok.advisor}`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200)
      .expect('Content-Type', 'image/png');
    const meta = await sharp(png.body as Buffer).metadata();
    expect(meta).toMatchObject({ format: 'png', width: 600, height: 150 });
    expect(meta.exif).toBeUndefined();
    expect(
      (await api(app, tok.admin).delete(`${base()}/profile/logo`).expect(200)).body.logoVersion,
    ).toBeNull();
    await api(app, tok.admin).get(`${base()}/profile/logo`).expect(404);
  });
});
