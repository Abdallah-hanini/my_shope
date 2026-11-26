import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { INSPECTION_ITEMS } from '@erp/validation';
import { api, bootApp, createUser, uid, type TestAuth } from './helpers';

// T-73: nobody quality-checks work they did on the job, except the owner, who must give a reason;
// the check is marked as own work in the timeline and the audit trail.

let app: INestApplication;
let auth: TestAuth;
let prisma: PrismaClient;
let companyId: string;
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};
const base = () => `/companies/${companyId}`;

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

/** A job in quality check whose only task was done by `technician`. */
async function jobInQc(technician: string) {
  const a = (t: string) => api(app, tok[t]);
  let j = (
    await a('owner')
      .post(`${base()}/jobs`, {
        branchId: ids.DOH,
        vehicleId: ids.vehicle,
        complaint: 'x',
        odometerIn: 1,
        fuelLevel: 'full',
        tasks: [{ description: 'Fix', estimatedHours: '1' }],
      })
      .expect(201)
  ).body;
  const step = async (t: string, path: string, body: object = {}) =>
    (j = (
      await a(t)
        .post(`${base()}/jobs/${j.id}/${path}`, { version: j.version, ...body })
        .expect(200)
    ).body);
  await step('owner', 'inspection', { items: INSPECTION_ITEMS.map((i) => ({ key: i.key, status: 'ok' })) });
  await step('owner', 'authorize', { authorizedByName: 'C', authorizedVia: 'phone' });
  await step('owner', `tasks/${j.tasks[0].id}/assign`, { technicianId: ids[technician] });
  await step(technician, 'start');
  await step(technician, `tasks/${j.tasks[0].id}/complete`);
  await step(technician, 'submit-qc');
  return j;
}

beforeAll(async () => {
  ({ app, auth, prisma } = await bootApp());
  const admin = await createUser(prisma, { platformAdmin: true });
  tok.admin = await auth.sign(admin.sub);
  companyId = (
    await api(app, tok.admin)
      .post('/companies', {
        code: `O${uid()}`,
        legalName: 'Own work fixture',
        baseCurrency: 'QAR',
        timezone: 'Asia/Qatar',
        initialAdminUserId: admin.id,
      })
      .expect(201)
  ).body.id;
  ids.DOH = (
    await api(app, tok.admin).post(`${base()}/branches`, { code: 'DOH', name: 'DOH' }).expect(201)
  ).body.id;
  const all = [
    'crm.customer.read',
    'crm.customer.manage',
    'workshop.job.read',
    'workshop.job.manage',
    'workshop.job.work',
    'workshop.job.qc',
  ];
  await person('owner', [...all, 'workshop.pricing.manage']);
  await person('foreman', all); // inspects, but is not an owner
  const c = (
    await api(app, tok.owner).post(`${base()}/customers`, { name: 'C', phone: '+97455550909' }).expect(201)
  ).body.id;
  ids.vehicle = (
    await api(app, tok.owner)
      .post(`${base()}/vehicles`, {
        customerId: c,
        plate: `OW ${uid().slice(0, 4)}`,
        make: 'Kia',
        model: 'Rio',
      })
      .expect(201)
  ).body.id;
});

afterAll(async () => {
  await prisma.$disconnect();
  await app.close();
});

describe('quality check of one’s own work', () => {
  it('a non-owner who worked on the job may not check it', async () => {
    const j = await jobInQc('foreman');
    expect(j.actions).not.toContain('qc');
    const r = await api(app, tok.foreman)
      .post(`${base()}/jobs/${j.id}/qc`, { version: j.version, result: 'pass', note: 'All good' })
      .expect(403);
    expect(r.body.detail).toMatch(/another inspector/);
  });

  it('the owner may, with a reason; it is marked in the timeline and audit trail', async () => {
    const j = await jobInQc('owner');
    expect(j.actions).toContain('qc');
    const q = (body: object) =>
      api(app, tok.owner).post(`${base()}/jobs/${j.id}/qc`, { version: j.version, ...body });
    expect((await q({ result: 'pass' }).expect(422)).body.detail).toMatch(/give the reason/);
    const r = (await q({ result: 'pass', note: 'Working alone today; road-tested twice' }).expect(200)).body;
    expect(r.status).toBe('ready');
    expect(r.events.at(-1)).toMatchObject({
      kind: 'qc_pass',
      selfCheck: true,
      note: 'Working alone today; road-tested twice',
    });
    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { entityId: j.id, action: 'workshop.job.qc_pass_own_work' },
    });
    expect(audit.reason).toBe('Working alone today; road-tested twice');
  });
});
