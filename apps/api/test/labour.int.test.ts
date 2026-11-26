import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { INSPECTION_ITEMS } from '@erp/validation';
import { localTime } from '../src/workshop/scheduling';
import { api, bootApp, createUser, uid, type TestAuth } from './helpers';

// WMS-007 labour time: who clocks what and when, one task at a time (also under concurrency),
// timers closed by the workflow, manager corrections without self-approval, immutable entries
// (API and database), and the per-technician report.

const TZ = 'Asia/Qatar';
let app: INestApplication;
let auth: TestAuth;
let prisma: PrismaClient;
let companyId: string;
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};
const base = () => `/companies/${companyId}`;
type Job = {
  id: string;
  number: string;
  version: number;
  status: string;
  actualHours: string;
  canRecordTime: boolean;
  tasks: {
    id: string;
    status: string;
    actualHours: string;
    canClockOn: boolean;
    myOpenEntryId: string | null;
    clockedOn: { entryId: string; technicianName: string }[];
  }[];
  timeEntries: {
    id: string;
    technicianName: string;
    endedAt: string | null;
    source: string;
    voided: boolean;
    canVoid: boolean;
    canStop: boolean;
  }[];
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

/** A job at `branch` taken to "in progress" with one task per technician. */
async function startedJob(manager: string, branch: string, techs: string[], hours: string[] = []) {
  const m = (path: string, body: object) => api(app, tok[manager]).post(`${base()}${path}`, body);
  let j: Job = (
    await m('/jobs', {
      branchId: ids[branch],
      vehicleId: ids[`vehicle${branch}`],
      complaint: 'Service',
      odometerIn: 1000,
      fuelLevel: 'half',
      tasks: techs.map((_, i) => ({ description: `Task ${i + 1}`, estimatedHours: hours[i] ?? '1' })),
    }).expect(201)
  ).body;
  j = (
    await m(`/jobs/${j.id}/inspection`, {
      version: j.version,
      items: INSPECTION_ITEMS.map((i) => ({ key: i.key, status: 'ok' })),
    }).expect(200)
  ).body;
  j = (
    await m(`/jobs/${j.id}/authorize`, {
      version: j.version,
      authorizedByName: 'Owner',
      authorizedVia: 'in_person',
    }).expect(200)
  ).body;
  for (const [i, t] of techs.entries())
    j = (
      await m(`/jobs/${j.id}/tasks/${j.tasks[i]!.id}/assign`, {
        version: j.version,
        technicianId: ids[t],
      }).expect(200)
    ).body;
  return (await m(`/jobs/${j.id}/start`, { version: j.version }).expect(200)).body as Job;
}
const clockOn = (t: string, j: Job, i = 0) =>
  api(app, tok[t]).post(`${base()}/jobs/${j.id}/tasks/${j.tasks[i]!.id}/clock-on`);
const clockOff = (t: string, entryId: string) =>
  api(app, tok[t]).post(`${base()}/time-entries/${entryId}/clock-off`);
const getJob = async (t: string, j: Job): Promise<Job> =>
  (await api(app, tok[t]).get(`${base()}/jobs/${j.id}`).expect(200)).body;

beforeAll(async () => {
  ({ app, auth, prisma } = await bootApp());
  const admin = await createUser(prisma, { platformAdmin: true });
  tok.admin = await auth.sign(admin.sub);
  const c = api(app, tok.admin);
  companyId = (
    await c
      .post('/companies', {
        code: `L${uid()}`,
        legalName: 'Labour fixture',
        baseCurrency: 'QAR',
        timezone: TZ,
        initialAdminUserId: admin.id,
      })
      .expect(201)
  ).body.id;
  for (const code of ['DOH', 'WAK'])
    ids[code] = (await c.post(`${base()}/branches`, { code, name: code }).expect(201)).body.id;
  const crm = ['crm.customer.read', 'crm.customer.manage'];
  await person('advisor', [...crm, 'workshop.job.read', 'workshop.job.manage'], ids.DOH!);
  // A working owner: manages and also works on cars.
  await person('owner', [...crm, 'workshop.job.read', 'workshop.job.manage', 'workshop.job.work'], ids.DOH!);
  for (const t of ['ali', 'sam']) await person(t, ['workshop.job.read', 'workshop.job.work'], ids.DOH!);
  await person('clerk', ['workshop.job.read'], ids.DOH!);
  await person('wakManager', [...crm, 'workshop.job.read', 'workshop.job.manage'], ids.WAK!);
  for (const t of ['hadi', 'omar']) await person(t, ['workshop.job.read', 'workshop.job.work'], ids.WAK!);
  for (const [b, m] of [
    ['DOH', 'advisor'],
    ['WAK', 'wakManager'],
  ] as const) {
    const cust = (
      await api(app, tok[m])
        .post(`${base()}/customers`, { name: `C ${b}`, phone: '+97455550404' })
        .expect(201)
    ).body.id;
    ids[`vehicle${b}`] = (
      await api(app, tok[m])
        .post(`${base()}/vehicles`, {
          customerId: cust,
          plate: `LT ${b}${uid().slice(0, 3)}`,
          make: 'Kia',
          model: 'Rio',
        })
        .expect(201)
    ).body.id;
  }
});

afterAll(async () => {
  await prisma.$disconnect();
  await app.close();
});

describe('clocking on and off', () => {
  it('only the assigned technician clocks on, and only while the job is in progress', async () => {
    const draft: Job = (
      await api(app, tok.advisor)
        .post(`${base()}/jobs`, {
          branchId: ids.DOH,
          vehicleId: ids.vehicleDOH,
          complaint: 'x',
          odometerIn: 1,
          fuelLevel: 'full',
          tasks: [{ description: 'x', estimatedHours: '1' }],
        })
        .expect(201)
    ).body;
    expect((await clockOn('ali', draft).expect(409)).body.detail).toMatch(/in progress/);
    const j = await startedJob('advisor', 'DOH', ['ali', 'sam']);
    ids.job1 = j.id;
    expect(j.tasks[0]).toMatchObject({ actualHours: '0.00', clockedOn: [], myOpenEntryId: null });
    await clockOn('sam', j, 0).expect(403); // not Sam's task
    await clockOn('advisor', j, 0).expect(403); // managers who are not technicians do not clock
    await clockOn('clerk', j, 0).expect(403);
    const r: Job = (await clockOn('ali', j, 0).expect(200)).body;
    expect(r.tasks[0]!.myOpenEntryId).toBeTruthy();
    expect(r.tasks[0]!.clockedOn.map((x) => x.technicianName)).toEqual(['ali']);
    expect(r.tasks[0]!.canClockOn).toBe(false);
    const current = (await api(app, tok.ali).get(`${base()}/time-entries/current`).expect(200)).body;
    expect(current.entry).toMatchObject({ jobNumber: j.number, taskLineNo: 1, taskDescription: 'Task 1' });
    expect((await api(app, tok.sam).get(`${base()}/time-entries/current`).expect(200)).body.entry).toBeNull();
  });

  it('a technician works on one task at a time, also when two clock-ons race', async () => {
    const j2 = await startedJob('advisor', 'DOH', ['ali', 'sam']);
    ids.job2 = j2.id;
    const busy = await clockOn('ali', j2, 0).expect(409);
    expect(busy.body.detail).toMatch(/clocked on to JC-\d{4}-\d{6} task 1; clock off there first/);
    const j3 = await startedJob('advisor', 'DOH', ['sam', 'sam']);
    const r = await Promise.all([clockOn('sam', j3, 0), clockOn('sam', j3, 1)]);
    expect(r.map((x) => x.status).sort()).toEqual([200, 409]);
    const open = await prisma.taskTimeEntry.count({ where: { technicianId: ids.sam, endedAt: null } });
    expect(open).toBe(1);
    const entry = (await getJob('sam', j3)).timeEntries.find((e) => !e.endedAt)!;
    await clockOff('ali', entry.id).expect(403); // another technician
    const stopped: Job = (await clockOff('sam', entry.id).expect(200)).body;
    expect(stopped.timeEntries.every((e) => e.endedAt)).toBe(true);
    await clockOff('sam', entry.id).expect(409);
  });

  it('a manager clocks off a forgotten timer; finishing, reassigning or cancelling stops timers', async () => {
    let j = await getJob('ali', { id: ids.job1! } as Job);
    const aliEntry = j.tasks[0]!.myOpenEntryId!;
    const managerView = await getJob('advisor', j);
    expect(managerView.timeEntries.find((e) => e.id === aliEntry)).toMatchObject({
      canStop: true,
      canVoid: false,
    });
    await clockOff('advisor', aliEntry).expect(200);

    // Completing a task stops its timer.
    await clockOn('ali', j, 0).expect(200);
    j = await getJob('ali', j);
    j = (
      await api(app, tok.ali)
        .post(`${base()}/jobs/${j.id}/tasks/${j.tasks[0]!.id}/complete`, { version: j.version })
        .expect(200)
    ).body;
    expect(j.tasks[0]!.clockedOn).toEqual([]);
    expect(await prisma.taskTimeEntry.count({ where: { technicianId: ids.ali, endedAt: null } })).toBe(0);
    await clockOn('ali', j, 0).expect(409); // done

    // Reassigning a task stops the previous technician's timer.
    await clockOn('sam', j, 1).expect(200);
    j = await getJob('advisor', j);
    j = (
      await api(app, tok.advisor)
        .post(`${base()}/jobs/${j.id}/tasks/${j.tasks[1]!.id}/assign`, {
          version: j.version,
          technicianId: ids.ali,
        })
        .expect(200)
    ).body;
    expect(j.tasks[1]!.clockedOn).toEqual([]);

    // Cancelling a job stops every timer on it.
    const j2 = await getJob('sam', { id: ids.job2! } as Job);
    await clockOn('sam', j2, 1).expect(200);
    await api(app, tok.advisor)
      .post(`${base()}/jobs/${j2.id}/cancel`, {
        version: (await getJob('advisor', j2)).version,
        reason: 'Customer left',
      })
      .expect(200);
    expect(await prisma.taskTimeEntry.count({ where: { jobId: j2.id, endedAt: null } })).toBe(0);
  });
});

describe('corrections', () => {
  it('managers enter missed time with a reason, never their own, never overlapping or in the future', async () => {
    const j = await startedJob('advisor', 'DOH', ['owner', 'sam']);
    ids.job4 = j.id;
    // The car was checked in this morning (times before that are refused).
    await prisma.jobCard.update({
      where: { id: j.id },
      data: { createdAt: new Date(Date.now() - 3 * 3_600_000) },
    });
    const now = Date.now();
    const iso = (minAgo: number) => new Date(now - minAgo * 60_000).toISOString();
    const add = (t: string, body: object) =>
      api(app, tok[t]).post(`${base()}/jobs/${j.id}/time-entries`, body);
    const entry = (technician: string, from: number, to: number) => ({
      taskId: j.tasks[1]!.id,
      technicianId: ids[technician],
      startedAt: iso(from),
      endedAt: iso(to),
      reason: 'Forgot to clock on',
    });
    expect(j.canRecordTime).toBe(true);
    await add('sam', entry('sam', 1, 0)).expect(403);
    expect((await add('owner', entry('owner', 1, 0)).expect(403)).body.detail).toMatch(/own time/);
    expect((await add('advisor', entry('clerk', 1, 0)).expect(422)).body.detail).toMatch(/cannot work/);
    expect((await add('advisor', entry('sam', 1, -5)).expect(422)).body.detail).toMatch(/future/);
    expect((await add('advisor', entry('sam', 240, 230)).expect(422)).body.detail).toMatch(/before the job/);
    await add('advisor', { ...entry('sam', 1, 0), reason: '' }).expect(400);
    const ok: Job = (await add('advisor', entry('sam', 60, 30)).expect(201)).body;
    const manual = ok.timeEntries.find((e) => e.source === 'manual')!;
    expect(manual).toMatchObject({ technicianName: 'sam', voided: false, canVoid: true });
    expect((await add('advisor', entry('sam', 45, 20)).expect(409)).body.detail).toMatch(/overlaps/);
    // The owner, as a manager, may correct Sam's time; Sam's time is not the owner's own.
    ids.manual = manual.id;
  });

  it('wrong entries are voided with a reason, stay on record and stop counting; never your own', async () => {
    const j = await getJob('owner', { id: ids.job4! } as Job);
    const v = (t: string, entryId: string, reason = 'Entered on the wrong task') =>
      api(app, tok[t]).post(`${base()}/time-entries/${entryId}/void`, { reason });
    await clockOn('owner', j, 0).expect(200);
    const ownerEntry = (await getJob('owner', j)).tasks[0]!.myOpenEntryId!;
    expect((await v('advisor', ownerEntry).expect(409)).body.detail).toMatch(/Clock this entry off/);
    await clockOff('owner', ownerEntry).expect(200);
    expect((await v('owner', ownerEntry).expect(403)).body.detail).toMatch(/own time/);
    await v('sam', ids.manual!).expect(403);
    await v('advisor', ids.manual!, 'no').expect(400);
    const before = (await getJob('advisor', j)).tasks[1]!.actualHours;
    expect(Number(before)).toBeGreaterThan(0);
    const after: Job = (await v('owner', ids.manual!).expect(200)).body;
    expect(after.timeEntries.find((e) => e.id === ids.manual)).toMatchObject({
      voided: true,
      canVoid: false,
    });
    expect(after.tasks[1]!.actualHours).toBe('0.00');
    await v('advisor', ids.manual!).expect(409);
  });

  it('the database keeps entries immutable and refuses overlaps', async () => {
    const e = await prisma.taskTimeEntry.findUniqueOrThrow({ where: { id: ids.manual! } });
    await expect(
      prisma.$executeRaw`UPDATE workshop.task_time_entry SET started_at = started_at - interval '1 hour' WHERE id = ${e.id}::uuid`,
    ).rejects.toThrow(/task_time_entry_immutable/);
    await expect(
      prisma.$executeRaw`DELETE FROM workshop.task_time_entry WHERE id = ${e.id}::uuid`,
    ).rejects.toThrow(/task_time_entry_immutable/);
    const closed = await prisma.taskTimeEntry.findFirstOrThrow({
      where: { technicianId: ids.owner, voidedAt: null, endedAt: { not: null } },
    });
    await expect(
      prisma.taskTimeEntry.create({
        data: { ...closed, id: undefined, createdAt: undefined, source: 'clock', reason: null },
      }),
    ).rejects.toThrow(/task_time_entry_no_overlap|23P01/);
    await expect(
      prisma.taskTimeEntry.create({
        data: {
          ...closed,
          id: undefined,
          createdAt: undefined,
          branchId: ids.WAK!,
          startedAt: new Date(0),
          endedAt: new Date(1000),
        },
      }),
    ).rejects.toThrow(/task_time_entry_branch_mismatch/);
  });
});

describe('labour report', () => {
  it('clocked hours, estimate against actual and efficiency per technician, in branch scope', async () => {
    const j = await startedJob('wakManager', 'WAK', ['hadi', 'omar', 'omar'], ['2', '1', '1']);
    const now = Date.now();
    const at = (minAgo: number) => new Date(now - minAgo * 60_000);
    const row = (taskIndex: number, technician: string, from: number, to: number) => ({
      companyId,
      branchId: ids.WAK!,
      jobId: j.id,
      taskId: j.tasks[taskIndex]!.id,
      technicianId: ids[technician]!,
      startedAt: at(from),
      endedAt: at(to),
      source: 'clock',
      createdBy: ids[technician]!,
    });
    // Hadi: 60 + 45 minutes on task 1 and a 30-minute entry that is voided.
    await prisma.taskTimeEntry.createMany({
      data: [row(0, 'hadi', 200, 140), row(0, 'hadi', 130, 85), row(0, 'hadi', 80, 50)],
    });
    const wrong = await prisma.taskTimeEntry.findFirstOrThrow({
      where: { technicianId: ids.hadi, startedAt: at(80) },
    });
    await api(app, tok.wakManager)
      .post(`${base()}/time-entries/${wrong.id}/void`, { reason: 'Duplicate of paper card' })
      .expect(200);
    let job = await getJob('hadi', j);
    job = (
      await api(app, tok.hadi)
        .post(`${base()}/jobs/${j.id}/tasks/${job.tasks[0]!.id}/complete`, { version: job.version })
        .expect(200)
    ).body;
    // Omar finishes task 2 without clocking, and is clocked on to task 3 now.
    job = (
      await api(app, tok.omar)
        .post(`${base()}/jobs/${j.id}/tasks/${job.tasks[1]!.id}/complete`, { version: job.version })
        .expect(200)
    ).body;
    await clockOn('omar', job, 2).expect(200);

    const today = localTime(new Date(), TZ).date;
    const yesterday = localTime(new Date(now - 86_400_000), TZ).date;
    const q = `from=${yesterday}&to=${today}&branchId=${ids.WAK}`;
    await api(app, tok.hadi).get(`${base()}/labour-time?${q}`).expect(403);
    await api(app, tok.advisor).get(`${base()}/labour-time?${q}`).expect(404); // not their branch
    await api(app, tok.wakManager).get(`${base()}/labour-time?from=${today}&to=${yesterday}`).expect(400);
    const r = (await api(app, tok.wakManager).get(`${base()}/labour-time?${q}`).expect(200)).body;
    expect(r).toMatchObject({ timeZone: TZ, branchId: ids.WAK, from: yesterday, to: today });
    expect(r.rows).toEqual([
      {
        technicianId: ids.hadi,
        technicianName: 'hadi',
        clockedHours: '1.75',
        entries: 2,
        jobs: 1,
        tasksDone: 1,
        tasksWithoutTime: 0,
        estimatedHours: '2.00',
        actualHours: '1.75',
        efficiencyPct: '114.3',
      },
      {
        technicianId: ids.omar,
        technicianName: 'omar',
        clockedHours: '0.00',
        entries: 0,
        jobs: 0,
        tasksDone: 1,
        tasksWithoutTime: 1,
        estimatedHours: '0.00',
        actualHours: '0.00',
        efficiencyPct: null,
      },
    ]);
    expect(r.totals).toMatchObject({ clockedHours: '1.75', tasksDone: 2, efficiencyPct: '114.3', jobs: 1 });
    expect(r.clockedOnNow).toEqual([
      expect.objectContaining({ technicianName: 'omar', jobNumber: j.number, taskDescription: 'Task 3' }),
    ]);
    // A company-wide view for the DOH manager contains only DOH.
    const doh = (
      await api(app, tok.advisor).get(`${base()}/labour-time?from=${yesterday}&to=${today}`).expect(200)
    ).body;
    expect(doh.rows.map((x: { technicianName: string }) => x.technicianName)).not.toContain('hadi');
  });
});
