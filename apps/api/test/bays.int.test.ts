import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { api, bootApp, createUser, uid, type TestAuth } from './helpers';

// WEB-022 bays: set up by managers per branch, one car per bay (also under concurrency), who may
// move cars, the board, deactivation, bays freed when the job closes, database guarantees, scope.

let app: INestApplication;
let auth: TestAuth;
let prisma: PrismaClient;
let companyId: string;
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};
const base = () => `/companies/${companyId}`;
type Board = {
  canManage: boolean;
  bays: { id: string; code: string; active: boolean; version: number; job: { number: string } | null }[];
  waiting: { id: string; number: string; canPlace: boolean }[];
};
type Job = {
  id: string;
  number: string;
  version: number;
  bayId: string | null;
  bayLabel: string | null;
  actions: string[];
  events: { kind: string; note: string | null }[];
};

async function person(name: string, permissions: string[], branch: string) {
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
const post = (t: string, path: string, body: object) => api(app, tok[t]).post(`${base()}${path}`, body);
const board = async (t = 'advisor', branch = ids.DOH): Promise<Board> =>
  (await api(app, tok[t]).get(`${base()}/branches/${branch}/bays`).expect(200)).body;
const job = async (t: string, id: string): Promise<Job> =>
  (await api(app, tok[t]).get(`${base()}/jobs/${id}`).expect(200)).body;
/** Places a job's car (current version) and checks the response status. */
const place = async (t: string, id: string, bayId: string | null, status: number) =>
  post(t, `/jobs/${id}/bay`, { version: (await job('advisor', id)).version, bayId }).expect(status);

async function newJob(manager = 'advisor', branch = 'DOH', technician?: string): Promise<Job> {
  let j: Job = (
    await post(manager, '/jobs', {
      branchId: ids[branch],
      vehicleId: ids[`vehicle${branch}`],
      complaint: 'Noise',
      odometerIn: 10,
      fuelLevel: 'half',
      tasks: [{ description: 'Check', estimatedHours: '1' }],
    }).expect(201)
  ).body;
  if (technician) {
    const full = (await api(app, tok[manager]).get(`${base()}/jobs/${j.id}`).expect(200)).body;
    j = (
      await post(manager, `/jobs/${j.id}/tasks/${full.tasks[0].id}/assign`, {
        version: j.version,
        technicianId: ids[technician],
      }).expect(200)
    ).body;
  }
  return j;
}

beforeAll(async () => {
  ({ app, auth, prisma } = await bootApp());
  const admin = await createUser(prisma, { platformAdmin: true });
  tok.admin = await auth.sign(admin.sub);
  companyId = (
    await api(app, tok.admin)
      .post('/companies', {
        code: `Y${uid()}`,
        legalName: 'Bays fixture',
        baseCurrency: 'QAR',
        timezone: 'Asia/Qatar',
        initialAdminUserId: admin.id,
      })
      .expect(201)
  ).body.id;
  for (const code of ['DOH', 'WAK'])
    ids[code] = (
      await api(app, tok.admin).post(`${base()}/branches`, { code, name: code }).expect(201)
    ).body.id;
  const mgr = ['crm.customer.read', 'crm.customer.manage', 'workshop.job.read', 'workshop.job.manage'];
  await person('advisor', mgr, ids.DOH!);
  await person('ali', ['workshop.job.read', 'workshop.job.work'], ids.DOH!);
  await person('sam', ['workshop.job.read', 'workshop.job.work'], ids.DOH!);
  await person('wak', mgr, ids.WAK!);
  for (const [b, m] of [
    ['DOH', 'advisor'],
    ['WAK', 'wak'],
  ] as const) {
    const c = (await post(m, '/customers', { name: `C${b}`, phone: '+97455550606' }).expect(201)).body.id;
    ids[`vehicle${b}`] = (
      await post(m, '/vehicles', {
        customerId: c,
        plate: `BY ${b}${uid().slice(0, 3)}`,
        make: 'Kia',
        model: 'Rio',
      }).expect(201)
    ).body.id;
  }
});

afterAll(async () => {
  await prisma.$disconnect();
  await app.close();
});

describe('setting up bays', () => {
  it('managers add bays to their branch; codes are unique per branch', async () => {
    await post('ali', `/branches/${ids.DOH}/bays`, { code: 'B1', name: 'Bay 1' }).expect(403);
    await post('wak', `/branches/${ids.DOH}/bays`, { code: 'B1', name: 'Bay 1' }).expect(404);
    for (const [code, name] of [
      ['b1', 'Bay 1'],
      ['B2', 'Bay 2'],
      ['LIFT-1', 'Lift'],
    ])
      await post('advisor', `/branches/${ids.DOH}/bays`, { code, name }).expect(201);
    expect(
      (await post('advisor', `/branches/${ids.DOH}/bays`, { code: 'B1', name: 'Again' }).expect(409)).body
        .detail,
    ).toMatch(/already exists/);
    await post('wak', `/branches/${ids.WAK}/bays`, { code: 'B1', name: 'Wakra 1' }).expect(201); // same code, other branch
    const b = await board();
    expect(b.canManage).toBe(true);
    expect(b.bays.map((x) => x.code)).toEqual(['B1', 'B2', 'LIFT-1']);
    for (const x of b.bays) ids[x.code] = x.id;
    ids.WAK_B1 = (await board('wak', ids.WAK)).bays[0]!.id;
    expect((await board('ali')).canManage).toBe(false);
  });
});

describe('cars on bays', () => {
  it('managers and the job’s technicians place cars; one car per bay; the timeline records moves', async () => {
    const j1 = await newJob('advisor', 'DOH', 'ali');
    const j2 = await newJob();
    ids.j1 = j1.id;
    ids.j2 = j2.id;
    expect((await board()).waiting.map((w) => w.number)).toEqual([j1.number, j2.number]);
    const r: Job = (await place('advisor', j1.id, ids.B1!, 200)).body;
    expect(r).toMatchObject({ bayId: ids.B1, bayLabel: 'B1 — Bay 1' });
    expect(r.events.at(-1)).toMatchObject({ kind: 'bay', note: 'B1 — Bay 1' });
    expect((await place('advisor', j2.id, ids.B1!, 409)).body.detail).toMatch(
      new RegExp(`B1 is taken by ${j1.number}`),
    );
    await place('advisor', j1.id, ids.B1!, 409); // already there
    await place('sam', j1.id, ids.B2!, 403); // not on this job
    await place('ali', j1.id, ids.B2!, 200); // Ali works on it
    await place('advisor', j2.id, ids.WAK_B1!, 422); // another branch's bay
    const b = await board('ali');
    expect(b.bays.find((x) => x.code === 'B2')!.job?.number).toBe(j1.number);
    expect(b.waiting.map((w) => [w.number, w.canPlace])).toEqual([[j2.number, false]]);
  });

  it('two cars sent to the same bay at the same moment: one gets it', async () => {
    const a = await newJob();
    const b = await newJob();
    const r = await Promise.all([
      post('advisor', `/jobs/${a.id}/bay`, { version: a.version, bayId: ids['LIFT-1'] }),
      post('advisor', `/jobs/${b.id}/bay`, { version: b.version, bayId: ids['LIFT-1'] }),
    ]);
    expect(r.map((x) => x.status).sort()).toEqual([200, 409]);
    ids.cancelMe = r[0]!.status === 200 ? a.id : b.id;
  });

  it('an occupied bay cannot be deactivated; inactive bays take no cars and are hidden from staff', async () => {
    const lift = (await board()).bays.find((x) => x.code === 'LIFT-1')!;
    const patch = (version: number, active: boolean) =>
      api(app, tok.advisor).patch(`${base()}/bays/${lift.id}`, { version, name: 'Lift', active });
    expect((await patch(lift.version, false).expect(409)).body.detail).toMatch(/move the car first/);
    await place('advisor', ids.cancelMe!, null, 200);
    const after = (await patch(lift.version, false).expect(200)).body as Board;
    expect(after.bays.find((x) => x.code === 'LIFT-1')).toMatchObject({ active: false });
    await patch(lift.version, true).expect(409); // stale version
    await place('advisor', ids.j2!, ids['LIFT-1']!, 422);
    expect((await board('ali')).bays.map((x) => x.code)).toEqual(['B1', 'B2']);
  });

  it('cancelling (or delivering) a job frees its bay', async () => {
    await place('advisor', ids.j2!, ids.B1!, 200);
    const j = await job('advisor', ids.j2!);
    const c: Job = (
      await post('advisor', `/jobs/${j.id}/cancel`, { version: j.version, reason: 'Customer left' }).expect(
        200,
      )
    ).body;
    expect(c.bayId).toBeNull();
    expect((await board()).bays.find((x) => x.code === 'B1')!.job).toBeNull();
  });
});

describe('database guarantees and scope', () => {
  it('one car per bay, own branch and active bays only, closed jobs hold no bay, bays are never deleted', async () => {
    const free = await newJob();
    await expect(prisma.jobCard.update({ where: { id: free.id }, data: { bayId: ids.B2 } })).rejects.toThrow(
      /job_card_one_per_bay|Unique constraint/,
    );
    await expect(
      prisma.jobCard.update({ where: { id: free.id }, data: { bayId: ids.WAK_B1 } }),
    ).rejects.toThrow(/job_bay_invalid/);
    await expect(
      prisma.jobCard.update({ where: { id: free.id }, data: { bayId: ids['LIFT-1'] } }),
    ).rejects.toThrow(/job_bay_invalid/);
    await expect(
      prisma.$executeRaw`UPDATE workshop.job_card SET status = 'cancelled', cancelled_reason = 'x' WHERE id = ${ids.j1}::uuid`,
    ).rejects.toThrow(/job_closed_has_no_bay/);
    await expect(prisma.bay.delete({ where: { id: ids.B1 } })).rejects.toThrow(/bay_delete_forbidden/);
    await expect(prisma.bay.update({ where: { id: ids.B2 }, data: { active: false } })).rejects.toThrow(
      /bay_occupied/,
    );
  });

  it('bays of another branch do not exist for its staff', async () => {
    await api(app, tok.wak).get(`${base()}/branches/${ids.DOH}/bays`).expect(404);
    await api(app, tok.wak)
      .patch(`${base()}/bays/${ids.B1}`, { version: 1, name: 'Mine', active: true })
      .expect(404);
  });
});
