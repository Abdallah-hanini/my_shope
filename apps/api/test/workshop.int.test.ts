import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { INSPECTION_ITEMS } from '@erp/validation';
import { OutboxDispatcher } from '../src/platform/outbox-dispatcher';
import { api, bootApp, createUser, uid, type TestAuth } from './helpers';

// Customers, vehicles and job cards: the full lifecycle with realistic roles, refusals, segregation
// of duties, concurrency, branch scope, database guarantees and notifications.

let app: INestApplication;
let auth: TestAuth;
let prisma: PrismaClient;
let companyId: string;
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};
const base = () => `/companies/${companyId}`;

async function person(name: string, permissions: string[], branch: 'DOH' | 'WAK' | null) {
  const role = (
    await api(app, tok.admin)
      .post(`${base()}/roles`, { code: `r-${uid()}`, name, permissions })
      .expect(201)
  ).body.id;
  const u = await createUser(prisma);
  await prisma.user.update({ where: { id: u.id }, data: { displayName: name } });
  await api(app, tok.admin)
    .post(`${base()}/role-assignments`, { userId: u.id, roleId: role, branchId: branch ? ids[branch] : null })
    .expect(201);
  ids[name] = u.id;
  tok[name] = await auth.sign(u.sub);
}
const job = (id: string, t = tok.advisor!) =>
  api(app, t)
    .get(`${base()}/jobs/${id}`)
    .expect(200)
    .then((r) => r.body);
const act = (t: string, id: string, path: string, body: object) =>
  api(app, t).post(`${base()}/jobs/${id}/${path}`, body);

beforeAll(async () => {
  ({ app, auth, prisma } = await bootApp());
  const admin = await createUser(prisma, { platformAdmin: true });
  tok.admin = await auth.sign(admin.sub);
  const c = api(app, tok.admin);
  companyId = (
    await c
      .post('/companies', {
        code: `W${uid()}`,
        legalName: 'Workshop fixture',
        baseCurrency: 'QAR',
        timezone: 'Asia/Qatar',
        initialAdminUserId: admin.id,
      })
      .expect(201)
  ).body.id;
  for (const code of ['DOH', 'WAK'])
    ids[code] = (await c.post(`${base()}/branches`, { code, name: code }).expect(201)).body.id;
  await person(
    'advisor',
    ['crm.customer.read', 'crm.customer.manage', 'workshop.job.read', 'workshop.job.manage'],
    'DOH',
  );
  await person('tech', ['workshop.job.read', 'workshop.job.work'], 'DOH');
  await person('tech2', ['workshop.job.read', 'workshop.job.work', 'workshop.job.qc'], 'DOH');
  await person('inspector', ['workshop.job.read', 'workshop.job.qc'], 'DOH');
  await person('wakTech', ['workshop.job.read', 'workshop.job.work'], 'WAK');
});

afterAll(async () => {
  await prisma.$disconnect();
  await app.close();
});

describe('customers and vehicles', () => {
  it('registers a customer and a vehicle; plates are normalised and unique; VINs validated', async () => {
    const a = api(app, tok.advisor);
    ids.customer = (
      await a
        .post(`${base()}/customers`, {
          name: 'Khalid Al-Marri',
          nameAr: 'خالد المري',
          phone: '+974 5555 0101',
        })
        .expect(201)
    ).body.id;
    const v = (
      await a
        .post(`${base()}/vehicles`, {
          customerId: ids.customer,
          plate: ' 123  456 ',
          vin: '1hgcm82633a004352',
          make: 'Toyota',
          model: 'Land Cruiser',
          year: 2019,
        })
        .expect(201)
    ).body;
    expect(v).toMatchObject({ plate: '123 456', vin: '1HGCM82633A004352', customerName: 'Khalid Al-Marri' });
    ids.vehicle = v.id;
    const dup = await a
      .post(`${base()}/vehicles`, { customerId: ids.customer, plate: '123 456', make: 'X', model: 'Y' })
      .expect(409);
    expect(dup.body.detail).toMatch(/plate or VIN/);
    await a
      .post(`${base()}/vehicles`, {
        customerId: ids.customer,
        plate: 'Q1',
        vin: 'BADVIN',
        make: 'X',
        model: 'Y',
      })
      .expect(400);
    await api(app, tok.tech).post(`${base()}/customers`, { name: 'x', phone: '+97455550000' }).expect(403);
  });

  it('a change of owner is recorded as a transfer; stale versions are refused', async () => {
    const a = api(app, tok.advisor);
    const other = (
      await a
        .post(`${base()}/customers`, { name: 'Fleet Co', kind: 'company', phone: '44001122' })
        .expect(201)
    ).body.id;
    const temp = (
      await a
        .post(`${base()}/vehicles`, {
          customerId: ids.customer,
          plate: 'T 9',
          make: 'Nissan',
          model: 'Patrol',
        })
        .expect(201)
    ).body;
    const moved = (
      await a
        .patch(`${base()}/vehicles/${temp.id}`, {
          customerId: other,
          plate: 'T 9',
          make: 'Nissan',
          model: 'Patrol',
          version: 1,
        })
        .expect(200)
    ).body;
    expect(moved).toMatchObject({ customerId: other, version: 2 });
    await a
      .patch(`${base()}/vehicles/${temp.id}`, {
        customerId: other,
        plate: 'T 9',
        make: 'Nissan',
        model: 'Patrol',
        version: 1,
      })
      .expect(409);
    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { entityId: temp.id, action: 'crm.vehicle.transfer' },
    });
    expect(audit.before).toMatchObject({ customerId: ids.customer });
  });
});

describe('job card lifecycle', () => {
  const tasks = [
    { description: 'Replace front brake pads', estimatedHours: '1.5' },
    { description: 'Road test', estimatedHours: '0.5' },
  ];

  it('check-in opens a numbered draft for the vehicle’s owner; only managers of the branch may open jobs', async () => {
    const body = {
      branchId: ids.DOH,
      vehicleId: ids.vehicle,
      complaint: 'Brakes squeal',
      odometerIn: 120500,
      fuelLevel: 'half',
      tasks,
    };
    await api(app, tok.tech).post(`${base()}/jobs`, body).expect(403);
    await api(app, tok.advisor)
      .post(`${base()}/jobs`, { ...body, branchId: ids.WAK })
      .expect(403);
    const j = (await api(app, tok.advisor).post(`${base()}/jobs`, body).expect(201)).body;
    expect(j).toMatchObject({
      status: 'draft',
      branchCode: 'DOH',
      customer: { id: ids.customer },
      estimatedHours: '2.00',
      version: 1,
    });
    expect(j.number).toMatch(/^JC-\d{4}-000001$/);
    expect(j.actions).toEqual([
      'edit',
      'inspect',
      'authorize',
      'assign',
      'cancel',
      'promise',
      'note',
      'addPhoto',
      'removePhoto',
      'placeBay',
    ]);
    expect(j.events.map((e: { kind: string }) => e.kind)).toEqual(['created']);
    ids.job = j.id;
    ids.task1 = j.tasks[0].id;
    ids.task2 = j.tasks[1].id;
  });

  it('a draft can be edited; authorisation freezes the tasks', async () => {
    const edited = (
      await api(app, tok.advisor)
        .patch(`${base()}/jobs/${ids.job}`, {
          complaint: 'Brakes squeal when cold',
          odometerIn: 120500,
          fuelLevel: 'half',
          tasks,
          version: 1,
        })
        .expect(200)
    ).body;
    ids.task1 = edited.tasks[0].id;
    ids.task2 = edited.tasks[1].id;
    // Authorisation needs the check-in inspection first.
    const noInspection = await act(tok.advisor!, ids.job!, 'authorize', {
      version: 2,
      authorizedByName: 'Khalid',
      authorizedVia: 'phone',
    }).expect(422);
    expect(noInspection.body.detail).toMatch(/check-in inspection/);
    await act(tok.advisor!, ids.job!, 'inspection', {
      version: 2,
      items: INSPECTION_ITEMS.map((i) => ({ key: i.key, status: 'ok' })),
    }).expect(200);
    await act(tok.tech!, ids.job!, 'authorize', {
      version: 3,
      authorizedByName: 'Khalid',
      authorizedVia: 'phone',
    }).expect(403);
    const ok = (
      await act(tok.advisor!, ids.job!, 'authorize', {
        version: 3,
        authorizedByName: 'Khalid',
        authorizedVia: 'phone',
      }).expect(200)
    ).body;
    expect(ok).toMatchObject({ status: 'approved', authorizedByName: 'Khalid', authorizedVia: 'phone' });
    await api(app, tok.advisor)
      .patch(`${base()}/jobs/${ids.job}`, {
        complaint: 'x',
        odometerIn: 1,
        fuelLevel: 'half',
        tasks,
        version: 4,
      })
      .expect(409);
  });

  it('assigns technicians of the branch only; all tasks assigned → assigned', async () => {
    const t = (await api(app, tok.advisor).get(`${base()}/jobs/${ids.job}/technicians`).expect(200)).body.map(
      (x: { displayName: string }) => x.displayName,
    );
    expect(t).toEqual(expect.arrayContaining(['tech', 'tech2']));
    expect(t).not.toContain('wakTech');
    await api(app, tok.tech).get(`${base()}/jobs/${ids.job}/technicians`).expect(403);
    await act(tok.advisor!, ids.job!, `tasks/${ids.task1}/assign`, {
      version: 4,
      technicianId: ids.wakTech,
    }).expect(422);
    let j = (
      await act(tok.advisor!, ids.job!, `tasks/${ids.task1}/assign`, {
        version: 4,
        technicianId: ids.tech,
      }).expect(200)
    ).body;
    expect(j.status).toBe('approved');
    j = (
      await act(tok.advisor!, ids.job!, `tasks/${ids.task2}/assign`, {
        version: 5,
        technicianId: ids.tech2,
      }).expect(200)
    ).body;
    expect(j.status).toBe('assigned');
    expect(j.tasks.map((x: { technicianName: string }) => x.technicianName)).toEqual(['tech', 'tech2']);
  });

  it('a stale version is refused, and two people starting at once produce one change', async () => {
    await act(tok.tech!, ids.job!, 'start', { version: 5 }).expect(409);
    const [a, b] = await Promise.all([
      act(tok.tech!, ids.job!, 'start', { version: 6 }),
      act(tok.tech2!, ids.job!, 'start', { version: 6 }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect((await job(ids.job!)).status).toBe('in_progress');
  });

  it('technicians complete only their own tasks; QC waits until every task is done', async () => {
    let j = await job(ids.job!, tok.tech);
    expect(j.tasks.map((t: { canComplete: boolean }) => t.canComplete)).toEqual([true, false]);
    await act(tok.tech!, ids.job!, `tasks/${ids.task2}/complete`, { version: j.version }).expect(403);
    j = (await act(tok.tech!, ids.job!, `tasks/${ids.task1}/complete`, { version: j.version }).expect(200))
      .body;
    const early = await act(tok.tech!, ids.job!, 'submit-qc', { version: j.version }).expect(422);
    expect(early.body.detail).toMatch(/Finish every task/);
    j = (await act(tok.tech2!, ids.job!, `tasks/${ids.task2}/complete`, { version: j.version }).expect(200))
      .body;
    j = (await act(tok.tech!, ids.job!, 'submit-qc', { version: j.version }).expect(200)).body;
    expect(j.status).toBe('qc');
  });

  it('nobody inspects their own work; a failed check reopens the chosen tasks for rework', async () => {
    let j = await job(ids.job!);
    const own = await act(tok.tech2!, ids.job!, 'qc', { result: 'pass', version: j.version }).expect(403);
    expect(own.body.detail).toMatch(/another inspector/);
    await act(tok.advisor!, ids.job!, 'qc', { result: 'pass', version: j.version }).expect(403);
    j = (
      await act(tok.inspector!, ids.job!, 'qc', {
        result: 'fail',
        version: j.version,
        note: 'Still squeals at low speed',
        reopenTaskIds: [ids.task1],
      }).expect(200)
    ).body;
    expect(j).toMatchObject({ status: 'rework', reworkCount: 1 });
    expect(j.tasks.map((t: { status: string }) => t.status)).toEqual(['open', 'done']);
    j = (await act(tok.tech!, ids.job!, `tasks/${ids.task1}/complete`, { version: j.version }).expect(200))
      .body;
    j = (await act(tok.tech!, ids.job!, 'submit-qc', { version: j.version }).expect(200)).body;
    j = (await act(tok.inspector!, ids.job!, 'qc', { result: 'pass', version: j.version }).expect(200)).body;
    expect(j.status).toBe('ready');
  });

  it('delivery records the hand-over; the closed job then accepts nothing but notes', async () => {
    let j = await job(ids.job!);
    const low = await act(tok.advisor!, ids.job!, 'deliver', {
      version: j.version,
      deliveredToName: 'Khalid',
      odometerOut: 100,
    }).expect(422);
    expect(low.body.detail).toMatch(/120500/);
    j = (
      await act(tok.advisor!, ids.job!, 'deliver', {
        version: j.version,
        deliveredToName: 'Khalid',
        odometerOut: 120512,
      }).expect(200)
    ).body;
    expect(j).toMatchObject({
      status: 'delivered',
      deliveredToName: 'Khalid',
      odometerOut: 120512,
      actions: ['note'],
    });
    await act(tok.advisor!, ids.job!, 'cancel', { version: j.version, reason: 'too late' }).expect(409);
    j = (await act(tok.tech!, ids.job!, 'notes', { note: 'Customer happy' }).expect(200)).body;
    expect(j.events.map((e: { kind: string; toStatus: string | null }) => e.toStatus ?? e.kind)).toEqual([
      'draft',
      'updated',
      'inspection',
      'approved',
      'assignment',
      'assigned',
      'in_progress',
      'task_done',
      'task_done',
      'qc',
      'rework',
      'task_done',
      'qc',
      'ready',
      'delivered',
      'note',
    ]);
  });

  it('global search finds the job by plate (typed without spaces), the vehicle and the customer', async () => {
    const r = (await api(app, tok.advisor).get(`${base()}/search?q=123456`).expect(200)).body;
    const group = (t: string) => r.groups.find((g: { type: string }) => g.type === t);
    expect(group('job').items.map((i: { id: string }) => i.id)).toContain(ids.job);
    expect(group('vehicle').items[0]).toMatchObject({
      id: ids.vehicle,
      code: '123 456',
      detail: 'Khalid Al-Marri',
    });
    const byPhone = (await api(app, tok.advisor).get(`${base()}/search?q=55550101`).expect(200)).body;
    expect(byPhone.groups.find((g: { type: string }) => g.type === 'customer').items[0].id).toBe(
      ids.customer,
    );
    // A technician without customer access searches jobs only.
    const techSearch = (await api(app, tok.tech).get(`${base()}/search?q=123456`).expect(200)).body;
    expect(techSearch.groups.map((g: { type: string }) => g.type)).toEqual(['job']);
    expect(
      (await api(app, tok.wakTech).get(`${base()}/search?q=123456`).expect(200)).body.groups[0].items,
    ).toEqual([]);
  });

  it('the vehicle’s service history lists the job', async () => {
    const h = (await api(app, tok.advisor).get(`${base()}/vehicles/${ids.vehicle}/jobs`).expect(200)).body;
    expect(h.map((x: { id: string }) => x.id)).toContain(ids.job);
  });

  it('technicians are told about assignments and rework; the advisor that the job is ready', async () => {
    await app.get(OutboxDispatcher).drain(1000);
    const kinds = async (u: string) =>
      (
        await prisma.notification.findMany({
          where: { companyId, userId: u, kind: { startsWith: 'job_' } },
          orderBy: { createdAt: 'asc' },
        })
      ).map((n) => n.kind);
    expect(await kinds(ids.tech!)).toEqual(['job_assigned', 'job_rework']);
    expect(await kinds(ids.tech2!)).toEqual(['job_assigned']);
    expect(await kinds(ids.advisor!)).toEqual(['job_ready']);
    const n = await prisma.notification.findFirstOrThrow({
      where: { userId: ids.tech!, kind: 'job_assigned' },
    });
    expect(n).toMatchObject({
      link: `jobs/${ids.job}`,
      params: { plate: '123 456', task: 'Replace front brake pads', actor: 'advisor' },
    });
  });
});

describe('scope, cancellation and database guarantees', () => {
  it('jobs of another branch do not exist for staff of this one', async () => {
    await api(app, tok.wakTech).get(`${base()}/jobs/${ids.job}`).expect(404);
    expect((await api(app, tok.wakTech).get(`${base()}/jobs?view=all`).expect(200)).body).toEqual([]);
    const outsider = await auth.sign((await createUser(prisma)).sub);
    await api(app, outsider).get(`${base()}/jobs`).expect(404);
  });

  it('cancelling needs a reason; the database keeps cancelled jobs closed', async () => {
    const j = (
      await api(app, tok.advisor)
        .post(`${base()}/jobs`, {
          branchId: ids.DOH,
          vehicleId: ids.vehicle,
          complaint: 'Oil change',
          odometerIn: 120600,
          fuelLevel: 'full',
          tasks: [{ description: 'Oil and filter', estimatedHours: '0.75' }],
        })
        .expect(201)
    ).body;
    expect(j.number).toMatch(/-000002$/);
    await act(tok.advisor!, j.id, 'cancel', { version: 1, reason: '' }).expect(400);
    const c = (
      await act(tok.advisor!, j.id, 'cancel', { version: 1, reason: 'Customer withdrew' }).expect(200)
    ).body;
    expect(c).toMatchObject({ status: 'cancelled', cancelledReason: 'Customer withdrew' });
    await expect(
      prisma.$executeRaw`UPDATE workshop.job_card SET complaint = 'x' WHERE id = ${j.id}::uuid`,
    ).rejects.toThrow(/cancelled and cannot be changed/);
  });

  it('the database refuses work without authorisation and edits to the timeline', async () => {
    const j = (
      await api(app, tok.advisor)
        .post(`${base()}/jobs`, {
          branchId: ids.DOH,
          vehicleId: ids.vehicle,
          complaint: 'AC weak',
          odometerIn: 120700,
          fuelLevel: 'quarter',
          tasks: [{ description: 'Check AC', estimatedHours: '1' }],
        })
        .expect(201)
    ).body;
    await expect(
      prisma.$executeRaw`UPDATE workshop.job_card SET status = 'approved' WHERE id = ${j.id}::uuid`,
    ).rejects.toThrow(/job_authorized_after_draft/);
    await expect(
      prisma.$executeRaw`UPDATE workshop.job_event SET note = 'x' WHERE job_id = ${j.id}::uuid`,
    ).rejects.toThrow(/immutable/);
    await expect(
      prisma.$executeRaw`DELETE FROM workshop.job_event WHERE job_id = ${j.id}::uuid`,
    ).rejects.toThrow(/immutable/);
  });

  it('new company administrators hold the workshop and customer permissions', async () => {
    const roles = await prisma.role.findMany({ where: { companyId, code: 'company-admin' } });
    expect(roles[0]!.permissions).toEqual(
      expect.arrayContaining([
        'crm.customer.manage',
        'workshop.job.manage',
        'workshop.job.work',
        'workshop.job.qc',
      ]),
    );
  });
});
