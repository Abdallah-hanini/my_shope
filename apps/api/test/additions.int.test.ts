import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { INSPECTION_ITEMS } from '@erp/validation';
import { OutboxDispatcher } from '../src/platform/outbox-dispatcher';
import { api, bootApp, createUser, uid, type TestAuth } from './helpers';

// WMS-009 / WEB-025 additional work: who proposes and decides, one open proposal at a time,
// approved tasks join the job, the quality check waits, records stay immutable (API and
// database), notifications.

let app: INestApplication;
let auth: TestAuth;
let prisma: PrismaClient;
let companyId: string;
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};
const base = () => `/companies/${companyId}`;
type Job = {
  id: string;
  version: number;
  status: string;
  estimatedHours: string;
  actions: string[];
  tasks: {
    id: string;
    lineNo: number;
    description: string;
    technicianId: string | null;
    additionSeq: number | null;
  }[];
  additions: {
    id: string;
    seq: number;
    status: string;
    tasks: { description: string }[];
    estimatedHours: string;
    authorizedByName: string | null;
    closeReason: string | null;
    canDecide: boolean;
    canWithdraw: boolean;
  }[];
  events: { kind: string; note: string | null }[];
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
const m = (path: string, body: object, t = 'advisor') => api(app, tok[t]).post(`${base()}${path}`, body);
const get = async (j: { id: string }, t = 'advisor'): Promise<Job> =>
  (await api(app, tok[t]).get(`${base()}/jobs/${j.id}`).expect(200)).body;

/** A job taken to `upTo` ('approved' | 'assigned' | 'in_progress'), its task assigned to Ali. */
async function job(upTo: 'draft' | 'approved' | 'assigned' | 'in_progress' = 'in_progress'): Promise<Job> {
  let j: Job = (
    await m('/jobs', {
      branchId: ids.DOH,
      vehicleId: ids.vehicle,
      complaint: 'Brake noise',
      odometerIn: 1000,
      fuelLevel: 'half',
      tasks: [{ description: 'Front pads', estimatedHours: '1.5' }],
    }).expect(201)
  ).body;
  if (upTo === 'draft') return j;
  j = (
    await m(`/jobs/${j.id}/inspection`, {
      version: j.version,
      items: INSPECTION_ITEMS.map((i) => ({ key: i.key, status: 'ok' })),
    }).expect(200)
  ).body;
  j = (
    await m(`/jobs/${j.id}/authorize`, {
      version: j.version,
      authorizedByName: 'Noor',
      authorizedVia: 'in_person',
    }).expect(200)
  ).body;
  if (upTo === 'approved') return j;
  j = (
    await m(`/jobs/${j.id}/tasks/${j.tasks[0]!.id}/assign`, {
      version: j.version,
      technicianId: ids.ali,
    }).expect(200)
  ).body;
  if (upTo === 'assigned') return j;
  return (await m(`/jobs/${j.id}/start`, { version: j.version }).expect(200)).body;
}
const proposal = (version: number, finding = 'Rear pads worn to 2 mm') => ({
  version,
  finding,
  tasks: [
    { description: 'Rear pads', estimatedHours: '1' },
    { description: 'Brake fluid flush', estimatedHours: '0.5' },
  ],
});

beforeAll(async () => {
  ({ app, auth, prisma } = await bootApp());
  const admin = await createUser(prisma, { platformAdmin: true });
  tok.admin = await auth.sign(admin.sub);
  companyId = (
    await api(app, tok.admin)
      .post('/companies', {
        code: `X${uid()}`,
        legalName: 'Additions fixture',
        baseCurrency: 'QAR',
        timezone: 'Asia/Qatar',
        initialAdminUserId: admin.id,
      })
      .expect(201)
  ).body.id;
  ids.DOH = (
    await api(app, tok.admin).post(`${base()}/branches`, { code: 'DOH', name: 'DOH' }).expect(201)
  ).body.id;
  await person('advisor', [
    'crm.customer.read',
    'crm.customer.manage',
    'workshop.job.read',
    'workshop.job.manage',
  ]);
  await person('ali', ['workshop.job.read', 'workshop.job.work']);
  await person('sam', ['workshop.job.read', 'workshop.job.work']);
  await person('clerk', ['workshop.job.read']);
  const cust = (await m('/customers', { name: 'Noor', phone: '+97455550505' }).expect(201)).body.id;
  ids.vehicle = (
    await m('/vehicles', {
      customerId: cust,
      plate: `AW ${uid().slice(0, 4)}`,
      make: 'Kia',
      model: 'Rio',
    }).expect(201)
  ).body.id;
});

afterAll(async () => {
  await prisma.$disconnect();
  await app.close();
});

describe('proposing additional work', () => {
  it('happens after authorisation, by a manager or a technician on the job, one proposal at a time', async () => {
    const draft = await job('draft');
    expect(draft.actions).not.toContain('proposeAddition');
    await m(`/jobs/${draft.id}/additions`, proposal(draft.version)).expect(409);
    const j = await job();
    ids.job = j.id;
    expect((await get(j, 'ali')).actions).toContain('proposeAddition');
    await m(`/jobs/${j.id}/additions`, proposal(j.version), 'clerk').expect(403);
    await m(`/jobs/${j.id}/additions`, proposal(j.version), 'sam').expect(403); // not on this job
    await m(`/jobs/${j.id}/additions`, { ...proposal(j.version), tasks: [] }, 'ali').expect(400);
    const r: Job = (await m(`/jobs/${j.id}/additions`, proposal(j.version), 'ali').expect(201)).body;
    expect(r.additions).toEqual([
      expect.objectContaining({
        seq: 1,
        status: 'proposed',
        estimatedHours: '1.50',
        tasks: [
          expect.objectContaining({ description: 'Rear pads' }),
          expect.objectContaining({ description: 'Brake fluid flush' }),
        ],
      }),
    ]);
    expect(r.tasks).toHaveLength(1); // nothing joins the job before the customer agrees
    expect(r.estimatedHours).toBe('1.50');
    expect(r.actions).not.toContain('proposeAddition');
    expect((await get(j, 'ali')).actions).not.toContain('submitQc');
    expect(r.events.at(-1)).toMatchObject({ kind: 'addition_proposed', note: 'Rear pads worn to 2 mm' });
    expect((await get(j, 'ali')).additions[0]).toMatchObject({ canDecide: false, canWithdraw: true });
    expect((await get(j)).additions[0]).toMatchObject({ canDecide: true, canWithdraw: true });
    expect(r.additions[0]).toMatchObject({ canDecide: false, canWithdraw: true }); // the proposer's view
    expect(
      (await m(`/jobs/${j.id}/additions`, proposal(r.version, 'Other'), 'advisor').expect(409)).body.detail,
    ).toMatch(/already waiting/);
  });

  it('the quality check waits for the decision', async () => {
    let j = await get({ id: ids.job! }, 'ali');
    j = (await m(`/jobs/${j.id}/tasks/${j.tasks[0]!.id}/complete`, { version: j.version }, 'ali').expect(200))
      .body;
    expect(
      (await m(`/jobs/${j.id}/submit-qc`, { version: j.version }, 'ali').expect(422)).body.detail,
    ).toMatch(/waiting for the customer/);
  });
});

describe('the customer decides', () => {
  it('approval is recorded by a manager; the tasks join the job, unassigned, numbered after the others', async () => {
    const j = await get({ id: ids.job! });
    const a = j.additions[0]!;
    const decide = (body: object, t = 'advisor') => m(`/jobs/${j.id}/additions/${a.id}/decision`, body, t);
    await decide(
      { decision: 'approve', version: j.version, authorizedByName: 'Noor', authorizedVia: 'phone' },
      'ali',
    ).expect(403);
    await decide({ decision: 'approve', version: j.version, authorizedVia: 'phone' }).expect(400);
    await decide({
      decision: 'approve',
      version: j.version - 1,
      authorizedByName: 'Noor',
      authorizedVia: 'phone',
    }).expect(409);
    const r: Job = (
      await decide({
        decision: 'approve',
        version: j.version,
        authorizedByName: 'Noor',
        authorizedVia: 'phone',
      }).expect(200)
    ).body;
    expect(r.additions[0]).toMatchObject({
      status: 'approved',
      authorizedByName: 'Noor',
      canDecide: false,
      canWithdraw: false,
    });
    expect(r.tasks.map((t) => [t.lineNo, t.description, t.technicianId, t.additionSeq])).toEqual([
      [1, 'Front pads', ids.ali, null],
      [2, 'Rear pads', null, 1],
      [3, 'Brake fluid flush', null, 1],
    ]);
    expect(r.estimatedHours).toBe('3.00');
    expect(r.status).toBe('in_progress');
    expect(r.actions).toContain('proposeAddition'); // a new question may be asked now
    expect(r.events.at(-1)).toMatchObject({ kind: 'addition_approved', note: 'Noor' });
    await decide({ decision: 'decline', version: r.version, reason: 'Changed mind' }).expect(409);
  });

  it('an assigned job goes back to approved until the new tasks have technicians', async () => {
    let j = await job('assigned');
    j = (await m(`/jobs/${j.id}/additions`, proposal(j.version)).expect(201)).body;
    j = (
      await m(`/jobs/${j.id}/additions/${j.additions[0]!.id}/decision`, {
        decision: 'approve',
        version: j.version,
        authorizedByName: 'Noor',
        authorizedVia: 'written',
      }).expect(200)
    ).body;
    expect(j.status).toBe('approved');
    expect(j.events.at(-1)).toMatchObject({ kind: 'addition_approved' });
  });

  it('a refusal needs a reason and adds nothing; proposals can be withdrawn by the proposer or a manager', async () => {
    let j = await job();
    j = (await m(`/jobs/${j.id}/additions`, proposal(j.version), 'ali').expect(201)).body;
    const a1 = j.additions[0]!;
    await m(`/jobs/${j.id}/additions/${a1.id}/decision`, {
      decision: 'decline',
      version: j.version,
      reason: '',
    }).expect(400);
    j = (
      await m(`/jobs/${j.id}/additions/${a1.id}/decision`, {
        decision: 'decline',
        version: j.version,
        reason: 'Customer will do it next month',
      }).expect(200)
    ).body;
    expect(j.additions[0]).toMatchObject({
      status: 'declined',
      closeReason: 'Customer will do it next month',
    });
    expect(j.tasks).toHaveLength(1);
    j = (await m(`/jobs/${j.id}/additions`, proposal(j.version, 'Wiper blades torn'), 'advisor').expect(201))
      .body;
    const a2 = j.additions[1]!;
    expect(a2.seq).toBe(2);
    await m(
      `/jobs/${j.id}/additions/${a2.id}/withdraw`,
      { version: j.version, reason: 'Mistake' },
      'ali',
    ).expect(403); // not Ali's
    j = (
      await m(`/jobs/${j.id}/additions/${a2.id}/withdraw`, {
        version: j.version,
        reason: 'Found spare blades',
      }).expect(200)
    ).body;
    expect(j.additions[1]).toMatchObject({ status: 'withdrawn', closeReason: 'Found spare blades' });
    // Cancelling the job withdraws an open proposal.
    j = (await m(`/jobs/${j.id}/additions`, proposal(j.version, 'Battery weak'), 'ali').expect(201)).body;
    j = (await m(`/jobs/${j.id}/cancel`, { version: j.version, reason: 'Customer took the car' }).expect(200))
      .body;
    expect(j.additions[2]).toMatchObject({ status: 'withdrawn', closeReason: 'Job cancelled' });
  });
});

describe('records and notifications', () => {
  it('the database adds tasks after authorisation only from approved additional work; decisions never change', async () => {
    const j = await get({ id: ids.job! });
    const task = (additionId: string | null) =>
      prisma.jobTask.create({
        data: { companyId, jobId: j.id, lineNo: 99, description: 'Sneaky', estimatedHours: '1', additionId },
      });
    await expect(task(null)).rejects.toThrow(/job_task_after_authorisation/);
    const declined = await prisma.jobAddition.findFirstOrThrow({ where: { status: 'declined', companyId } });
    await expect(
      prisma.jobTask.create({
        data: {
          companyId,
          jobId: declined.jobId,
          lineNo: 99,
          description: 'Sneaky',
          estimatedHours: '1',
          additionId: declined.id,
        },
      }),
    ).rejects.toThrow(/job_task_addition_not_approved/);
    const approved = j.additions[0]!;
    await expect(
      prisma.jobAddition.update({ where: { id: approved.id }, data: { authorizedByName: 'Someone else' } }),
    ).rejects.toThrow(/job_addition_immutable/);
    await expect(
      prisma.$executeRaw`UPDATE workshop.job_addition_item SET estimated_hours = 9 WHERE addition_id = ${approved.id}::uuid`,
    ).rejects.toThrow();
  });

  it('managers hear of proposals; the proposer hears the decision', async () => {
    await app.get(OutboxDispatcher).drain(1000);
    const kinds = async (u: string) =>
      (
        await prisma.notification.findMany({
          where: { companyId, userId: u, kind: { startsWith: 'job_addition' } },
          orderBy: { createdAt: 'asc' },
        })
      ).map((n) => n.kind);
    // Ali proposed three times (approved, declined, withdrawn-by-cancel); the advisor proposed twice.
    expect(await kinds(ids.advisor!)).toEqual([
      'job_addition_proposed',
      'job_addition_proposed',
      'job_addition_proposed',
    ]);
    expect(await kinds(ids.ali!)).toEqual(['job_addition_approved', 'job_addition_declined']);
    expect(await kinds(ids.sam!)).toEqual([]);
    const n = await prisma.notification.findFirstOrThrow({
      where: { userId: ids.advisor, kind: 'job_addition_proposed' },
    });
    expect(n).toMatchObject({
      link: `jobs/${ids.job}`,
      params: { finding: 'Rear pads worn to 2 mm', actor: 'ali' },
    });
  });
});
