import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { localTime, zonedInstant } from '../src/workshop/scheduling';
import { api, bootApp, createUser, uid, type TestAuth } from './helpers';

// WMS-002 appointments: hours and capacity per branch, booking rules, peak-based bay limit with
// concurrent bookings, rescheduling, cancellation, no-shows, check-in to a job card, scope.

const TZ = 'Asia/Qatar';
let app: INestApplication;
let auth: TestAuth;
let prisma: PrismaClient;
let companyId: string;
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};
const base = () => `/companies/${companyId}`;

/** A local date a few days ahead and an instant at HH:MM on it (company time zone). */
const day = localTime(new Date(Date.now() + 3 * 86_400_000), TZ).date;
const at = (hhmm: string, d = day) =>
  zonedInstant(d, Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)), TZ).toISOString();
const allWeek = Array.from({ length: 7 }, (_, weekday) => ({ weekday, opens: '08:00', closes: '17:00' }));

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
  tok[name] = await auth.sign(u.sub);
}
const book = (vehicle: string, start: string, minutes = 60, t = tok.advisor!) =>
  api(app, t).post(`${base()}/appointments`, {
    branchId: ids.DOH,
    vehicleId: ids[vehicle],
    startsAt: at(start),
    durationMinutes: minutes,
    service: 'Service',
  });

beforeAll(async () => {
  ({ app, auth, prisma } = await bootApp());
  const admin = await createUser(prisma, { platformAdmin: true });
  tok.admin = await auth.sign(admin.sub);
  const c = api(app, tok.admin);
  companyId = (
    await c
      .post('/companies', {
        code: `A${uid()}`,
        legalName: 'Booking fixture',
        baseCurrency: 'QAR',
        timezone: TZ,
        initialAdminUserId: admin.id,
      })
      .expect(201)
  ).body.id;
  for (const code of ['DOH', 'WAK'])
    ids[code] = (await c.post(`${base()}/branches`, { code, name: code }).expect(201)).body.id;
  await person(
    'advisor',
    ['crm.customer.read', 'crm.customer.manage', 'workshop.job.read', 'workshop.job.manage'],
    ids.DOH!,
  );
  await person('tech', ['workshop.job.read', 'workshop.job.work'], ids.DOH!);
  await person('wak', ['workshop.job.read', 'workshop.job.manage'], ids.WAK!);
  const cust = (
    await api(app, tok.advisor)
      .post(`${base()}/customers`, { name: 'Huda', phone: '+97455550303' })
      .expect(201)
  ).body.id;
  for (const v of ['A', 'B', 'C', 'D', 'E']) {
    ids[v] = (
      await api(app, tok.advisor)
        .post(`${base()}/vehicles`, {
          customerId: cust,
          plate: `AP ${v}${uid().slice(0, 3)}`,
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

describe('workshop hours', () => {
  it('booking is refused until the branch has hours; only managers set them; versions protect edits', async () => {
    const refused = await book('A', '09:00').expect(422);
    expect(refused.body.detail).toMatch(/Set the workshop hours/);
    const empty = (
      await api(app, tok.advisor).get(`${base()}/branches/${ids.DOH}/workshop-schedule`).expect(200)
    ).body;
    expect(empty).toMatchObject({ configured: false, version: 0, hours: [] });
    const body = { version: 0, bays: 2, slotMinutes: 30, hours: allWeek };
    await api(app, tok.tech).put(`${base()}/branches/${ids.DOH}/workshop-schedule`, body).expect(403);
    const s = (
      await api(app, tok.advisor).put(`${base()}/branches/${ids.DOH}/workshop-schedule`, body).expect(200)
    ).body;
    expect(s).toMatchObject({ configured: true, bays: 2, slotMinutes: 30, version: 1 });
    expect(s.hours[0]).toEqual({ weekday: 0, opens: '08:00', closes: '17:00' });
    await api(app, tok.advisor).put(`${base()}/branches/${ids.DOH}/workshop-schedule`, body).expect(409);
    await api(app, tok.advisor)
      .put(`${base()}/branches/${ids.DOH}/workshop-schedule`, {
        ...body,
        version: 1,
        hours: [{ weekday: 1, opens: '17:00', closes: '08:00' }],
      })
      .expect(400);
  });
});

describe('booking rules', () => {
  it('fits opening hours and the slot grid, and is in the future', async () => {
    expect((await book('A', '07:30').expect(422)).body.detail).toMatch(
      /Outside opening hours \(08:00–17:00\)/,
    );
    expect((await book('A', '16:30', 60).expect(422)).body.detail).toMatch(/Outside opening hours/);
    expect((await book('A', '09:10').expect(422)).body.detail).toMatch(/30-minute grid/);
    expect((await book('A', '09:00', 45).expect(422)).body.detail).toMatch(/multiple of 30/);
    const past = await api(app, tok.advisor)
      .post(`${base()}/appointments`, {
        branchId: ids.DOH,
        vehicleId: ids.A,
        startsAt: at('09:00', '2020-01-04'),
        durationMinutes: 60,
        service: 'x',
      })
      .expect(422);
    expect(past.body.detail).toMatch(/already passed/);
    await book('A', '09:00', 60, tok.tech).expect(403);
  });

  it('never books more cars at once than there are bays, counting the peak; no double booking of a car', async () => {
    const a = (await book('A', '09:00').expect(201)).body;
    expect(a).toMatchObject({
      status: 'booked',
      durationMinutes: 60,
      customer: { name: 'Huda' },
      actions: ['checkIn', 'reschedule', 'cancel'],
    });
    ids.apptA = a.id;
    await book('B', '09:30').expect(201); // 09:30–10:30
    const full = await book('C', '09:30', 30).expect(409);
    expect(full.body.detail).toMatch(/All 2 bays are booked/);
    await book('C', '10:00').expect(201); // 10:00–11:00 overlaps only B: peak 1 + 1 = 2
    expect((await book('A', '09:30', 30).expect(409)).body.detail).toMatch(/already has an appointment/);
  });

  it('three people booking the last bay at the same moment produce exactly one booking', async () => {
    await book('D', '13:00').expect(201); // one of two bays at 13:00
    const r = await Promise.all(['A', 'B', 'E'].map((v) => book(v, '13:00')));
    expect(r.map((x) => x.status).sort()).toEqual([201, 409, 409]);
  });

  it('the day view shows slots with free bays and the appointments', async () => {
    const d = (
      await api(app, tok.tech).get(`${base()}/appointments?branchId=${ids.DOH}&date=${day}`).expect(200)
    ).body;
    expect(d).toMatchObject({ date: day, timeZone: TZ, schedule: { bays: 2 } });
    expect(d.slots).toHaveLength(18);
    const slot = (hhmm: string) => d.slots.find((s: { start: string }) => s.start === at(hhmm));
    expect(slot('09:00')).toMatchObject({ booked: 1, free: 1 });
    expect(slot('09:30')).toMatchObject({ booked: 2, free: 0 });
    expect(slot('11:00')).toMatchObject({ booked: 0, free: 2 });
    expect(d.appointments.length).toBe(5);
    expect(d.appointments.every((x: { actions: string[] }) => x.actions.length === 0)).toBe(true); // technicians only view
  });
});

describe('changes, check-in and scope', () => {
  it('rescheduling follows the same rules; cancelling frees the bay; closed appointments cannot change', async () => {
    const a = (await api(app, tok.advisor).get(`${base()}/appointments/${ids.apptA}`).expect(200)).body;
    const move = (startsAt: string, version = a.version) =>
      api(app, tok.advisor).post(`${base()}/appointments/${ids.apptA}/reschedule`, {
        version,
        startsAt: at(startsAt),
        durationMinutes: 60,
      });
    expect((await move('09:30').expect(409)).body.detail).toMatch(/bays/); // B and C fill 10:00
    const moved = (await move('14:00').expect(200)).body;
    expect(moved.startsAt).toBe(at('14:00'));
    await move('15:00', a.version).expect(409); // stale version
    await api(app, tok.advisor)
      .post(`${base()}/appointments/${ids.apptA}/cancel`, { version: moved.version, reason: '' })
      .expect(400);
    const cancelled = (
      await api(app, tok.advisor)
        .post(`${base()}/appointments/${ids.apptA}/cancel`, {
          version: moved.version,
          reason: 'Customer travelling',
        })
        .expect(200)
    ).body;
    expect(cancelled).toMatchObject({
      status: 'cancelled',
      cancelledReason: 'Customer travelling',
      actions: [],
    });
    await api(app, tok.advisor)
      .post(`${base()}/appointments/${ids.apptA}/reschedule`, {
        version: cancelled.version,
        startsAt: at('15:00'),
        durationMinutes: 60,
      })
      .expect(409);
    await book('A', '14:00').expect(201); // the bay is free again
  });

  it('no-show only after the appointment time', async () => {
    const e = (await book('E', '16:00').expect(201)).body;
    expect(
      (
        await api(app, tok.advisor)
          .post(`${base()}/appointments/${e.id}/no-show`, { version: e.version })
          .expect(422)
      ).body.detail,
    ).toMatch(/after the appointment time/);
    await prisma.appointment.update({
      where: { id: e.id },
      data: { startsAt: new Date(Date.now() - 7_200_000), endsAt: new Date(Date.now() - 3_600_000) },
    });
    const n = (
      await api(app, tok.advisor)
        .post(`${base()}/appointments/${e.id}/no-show`, { version: e.version })
        .expect(200)
    ).body;
    expect(n.status).toBe('no_show');
  });

  it('check-in opens the job card and links it; only once, and only for the same vehicle and branch', async () => {
    const appt = (await book('B', '15:00').expect(201)).body;
    const job = (vehicleId: string, branchId = ids.DOH) =>
      api(app, tok.advisor).post(`${base()}/jobs`, {
        branchId,
        vehicleId,
        appointmentId: appt.id,
        complaint: 'Booked service',
        odometerIn: 1000,
        fuelLevel: 'full',
        tasks: [{ description: 'Service', estimatedHours: '1' }],
      });
    expect((await job(ids.C!).expect(422)).body.detail).toMatch(/another vehicle or branch/);
    const j = (await job(ids.B!).expect(201)).body;
    const linked = (await api(app, tok.advisor).get(`${base()}/appointments/${appt.id}`).expect(200)).body;
    expect(linked).toMatchObject({ status: 'checked_in', jobId: j.id, jobNumber: j.number, actions: [] });
    expect((await job(ids.B!).expect(409)).body.detail).toMatch(/checked in, not booked/);
    await expect(
      prisma.$executeRaw`UPDATE workshop.appointment SET job_id = NULL WHERE id = ${appt.id}::uuid`,
    ).rejects.toThrow(/appointment_checked_in_has_job/);
  });

  it('appointments of another branch do not exist for its staff', async () => {
    await api(app, tok.wak).get(`${base()}/appointments/${ids.apptA}`).expect(404);
    await api(app, tok.wak).get(`${base()}/appointments?branchId=${ids.DOH}&date=${day}`).expect(404);
    await api(app, tok.wak)
      .put(`${base()}/branches/${ids.DOH}/workshop-schedule`, {
        version: 1,
        bays: 9,
        slotMinutes: 30,
        hours: allWeek,
      })
      .expect(404);
  });
});
