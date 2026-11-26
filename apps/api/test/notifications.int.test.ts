import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { ExportService } from '../src/exports/export.service';
import { MAX_ATTEMPTS, OutboxDispatcher } from '../src/platform/outbox-dispatcher';
import { api, bootApp, createUser, uid, type TestAuth } from './helpers';

// Outbox dispatcher (P1-11) and notification inbox: every notification comes from a committed
// business event; nobody is told about their own action or about records they cannot see.

let app: INestApplication;
let auth: TestAuth;
let prisma: PrismaClient;
let dispatcher: OutboxDispatcher;
let companyId: string;
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};

const base = () => `/companies/${companyId}`;
const inbox = (userId: string) =>
  prisma.notification.findMany({ where: { companyId, userId }, orderBy: { createdAt: 'asc' } });
async function person(name: string, roleId: string | null, branchId: string | null = null) {
  const u = await createUser(prisma);
  await prisma.user.update({ where: { id: u.id }, data: { displayName: name } });
  let assignmentId: string | undefined;
  if (roleId)
    assignmentId = (
      await api(app, tok.admin)
        .post(`${base()}/role-assignments`, { userId: u.id, roleId, branchId })
        .expect(201)
    ).body.id;
  return { id: u.id, token: await auth.sign(u.sub), assignmentId };
}
async function role(permissions: string[], name = `role-${uid()}`) {
  return (
    await api(app, tok.admin)
      .post(`${base()}/roles`, { code: `r-${uid()}`, name, nameAr: `دور ${name}`, permissions })
      .expect(201)
  ).body.id as string;
}
async function journal(t: string, branchId: string | null = null) {
  return (
    await api(app, t)
      .post(
        `${base()}/journals`,
        {
          postingDate: '2026-06-01',
          description: 'synthetic',
          ...(branchId ? { branchId } : {}),
          lines: [
            { accountId: ids.CASH, debit: '5', credit: '0' },
            { accountId: ids.CAP, debit: '0', credit: '5' },
          ],
        },
        { 'Idempotency-Key': randomUUID() },
      )
      .expect(201)
  ).body as { id: string; number: string };
}
const reverse = async (t: string, id: string) =>
  (
    await api(app, t)
      .post(
        `${base()}/journals/${id}/reverse`,
        { postingDate: '2026-06-02', reason: 'test reversal' },
        { 'Idempotency-Key': randomUUID() },
      )
      .expect(201)
  ).body as { id: string; number: string };

beforeAll(async () => {
  ({ app, auth, prisma } = await bootApp());
  dispatcher = app.get(OutboxDispatcher);
  const admin = await createUser(prisma, { platformAdmin: true });
  await prisma.user.update({ where: { id: admin.id }, data: { displayName: 'Owner Admin' } });
  ids.admin = admin.id;
  tok.admin = await auth.sign(admin.sub);
  const c = api(app, tok.admin);
  companyId = (
    await c
      .post('/companies', {
        code: `N${uid()}`,
        legalName: 'Notify fixture',
        baseCurrency: 'QAR',
        timezone: 'Asia/Qatar',
        initialAdminUserId: admin.id,
      })
      .expect(201)
  ).body.id;
  ids.DOH = (await c.post(`${base()}/branches`, { code: 'DOH', name: 'Doha' }).expect(201)).body.id;
  for (const [k, code, type] of [
    ['CASH', '1100', 'asset'],
    ['CAP', '3100', 'equity'],
  ] as const) {
    ids[k] = (
      await c.post(`${base()}/accounts`, { code, name: k, type, isPosting: true }).expect(201)
    ).body.id;
  }
  ids.period = (
    await c
      .post(`${base()}/fiscal-periods`, { name: 'FY2026', startDate: '2026-01-01', endDate: '2026-12-31' })
      .expect(201)
  ).body.id;
  ids.posterRole = await role(
    ['accounting.journal.post', 'accounting.journal.read', 'accounting.period.read'],
    'Cashier',
  );
  ids.postOnlyRole = await role(['accounting.journal.post', 'accounting.journal.read']);
  const poster = await person('Sara Poster', ids.posterRole);
  ids.poster = poster.id;
  tok.poster = poster.token;
  const postOnly = await person('Ali PostOnly', ids.postOnlyRole);
  ids.postOnly = postOnly.id;
  ids.viewer = (await person('Viewer', await role(['accounting.journal.read']), ids.DOH)).id;
  await dispatcher.drain(10_000); // setup events (role grants etc.) out of the way
  await prisma.notification.deleteMany({ where: { companyId } });
});

afterAll(async () => {
  await prisma.$disconnect();
  await app.close();
});

describe('notification rules', () => {
  it('a reversal notifies the original poster (not the reverser), with numbers, actor and link', async () => {
    const j = await journal(tok.poster!);
    const r = await reverse(tok.admin!, j.id);
    await dispatcher.drain();
    const [n, ...rest] = await inbox(ids.poster!);
    expect(rest).toHaveLength(0);
    expect(n).toMatchObject({
      kind: 'journal_reversed',
      params: { number: j.number, reversalNumber: r.number, actor: 'Owner Admin' },
      link: `journals/${r.id}`,
      readAt: null,
    });
    expect(await inbox(ids.admin!)).toHaveLength(0);
  });

  it('reversing your own journal notifies nobody; neither does one you can no longer see', async () => {
    await prisma.notification.deleteMany({ where: { companyId } });
    const own = await journal(tok.admin!);
    await reverse(tok.admin!, own.id);
    const gone = await person('Gone Poster', ids.postOnlyRole!);
    const j = await journal(gone.token);
    await api(app, tok.admin).delete(`${base()}/role-assignments/${gone.assignmentId!}`).expect(204);
    await reverse(tok.admin!, j.id);
    await dispatcher.drain();
    expect(await inbox(ids.admin!)).toHaveLength(0);
    // They were told about losing the role, but not about a journal they can no longer see.
    expect((await inbox(gone.id)).map((n) => n.kind)).toEqual(['role_granted', 'role_revoked']);
  });

  it('granting and removing a role notifies the person, with role, branch and actor', async () => {
    await prisma.notification.deleteMany({ where: { companyId } });
    const extra = await role(['accounting.account.read'], 'Accounts reader');
    const a = (
      await api(app, tok.admin)
        .post(`${base()}/role-assignments`, { userId: ids.poster, roleId: extra, branchId: ids.DOH })
        .expect(201)
    ).body.id;
    await api(app, tok.admin).delete(`${base()}/role-assignments/${a}`).expect(204);
    await dispatcher.drain();
    const list = await inbox(ids.poster!);
    expect(list.map((n) => n.kind)).toEqual(['role_granted', 'role_revoked']);
    expect(list[0]!.params).toEqual({
      role: 'Accounts reader',
      roleAr: 'دور Accounts reader',
      branch: 'DOH',
      actor: 'Owner Admin',
    });
  });

  it('changing a role notifies its holders, not the editor', async () => {
    await prisma.notification.deleteMany({ where: { companyId } });
    const r = (await api(app, tok.admin).get(`${base()}/roles`).expect(200)).body.find(
      (x: { id: string }) => x.id === ids.posterRole,
    );
    await api(app, tok.admin)
      .patch(`${base()}/roles/${ids.posterRole}`, {
        name: 'Cashier',
        permissions: [...r.permissions, 'accounting.account.read'],
        version: r.version,
      })
      .expect(200);
    await dispatcher.drain();
    expect((await inbox(ids.poster!)).map((n) => [n.kind, (n.params as { role: string }).role])).toEqual([
      ['role_changed', 'Cashier'],
    ]);
    expect(await inbox(ids.admin!)).toHaveLength(0);
  });

  it('closing a period tells people who post journals; the link only if they can open periods', async () => {
    await prisma.notification.deleteMany({ where: { companyId } });
    const p = (
      await api(app, tok.admin)
        .post(`${base()}/fiscal-periods`, { name: '2027-01', startDate: '2027-01-01', endDate: '2027-01-31' })
        .expect(201)
    ).body;
    await api(app, tok.admin)
      .post(`${base()}/fiscal-periods/${p.id}/close`, { reason: 'month end', version: p.version })
      .expect(200);
    await dispatcher.drain();
    expect(await inbox(ids.poster!)).toEqual([
      expect.objectContaining({
        kind: 'period_closed',
        link: 'periods',
        params: { period: '2027-01', actor: 'Owner Admin' },
      }),
    ]);
    expect(await inbox(ids.postOnly!)).toEqual([
      expect.objectContaining({ kind: 'period_closed', link: null }),
    ]);
    expect(await inbox(ids.viewer!)).toHaveLength(0);
    expect(await inbox(ids.admin!)).toHaveLength(0);
  });

  it('a finished or failed export notifies its requester', async () => {
    await prisma.notification.deleteMany({ where: { companyId } });
    const exportsSvc = app.get(ExportService);
    const body = { kind: 'journal_lines', format: 'csv', params: { from: '2026-01-01', to: '2026-12-31' } };
    const ok = (await api(app, tok.poster).post(`${base()}/exports`, body).expect(202)).body;
    await exportsSvc.process(ok.id);
    const bad = (await api(app, tok.poster).post(`${base()}/exports`, body).expect(202)).body;
    await prisma.exportJob.update({
      where: { id: bad.id },
      data: { status: 'running', startedAt: new Date(Date.now() - 3_600_000) },
    });
    await exportsSvc.sweep(); // interrupted → failed, with an event
    await dispatcher.drain();
    const list = await inbox(ids.poster!);
    expect(list.map((n) => n.kind)).toEqual(['export_ready', 'export_failed']);
    expect(list[0]).toMatchObject({
      link: 'exports',
      params: { exportKind: 'journal_lines', fileName: expect.stringMatching(/\.csv$/) },
    });
    expect(list[1]!.params).toMatchObject({ error: expect.stringMatching(/interrupted/) });
  });
});

describe('outbox delivery', () => {
  it('delivering an event again creates no duplicate notifications', async () => {
    const before = (await inbox(ids.poster!)).length;
    const event = await prisma.outboxEvent.findFirstOrThrow({
      where: { companyId, eventType: 'export.completed' },
      orderBy: { occurredAt: 'desc' },
    });
    await prisma.outboxEvent.update({ where: { id: event.id }, data: { publishedAt: null } });
    await dispatcher.drain();
    expect(
      (await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } })).publishedAt,
    ).not.toBeNull();
    expect(await inbox(ids.poster!)).toHaveLength(before);
  });

  it('unknown event types are delivered to no one', async () => {
    const e = await prisma.outboxEvent.create({
      data: { companyId, aggregateType: 'x', aggregateId: 'x', eventType: 'test.unknown', payload: {} },
    });
    await dispatcher.drain();
    expect((await prisma.outboxEvent.findUniqueOrThrow({ where: { id: e.id } })).publishedAt).not.toBeNull();
  });

  it('a failing event is retried with backoff, then dead-lettered and reported by the health check', async () => {
    const e = await prisma.outboxEvent.create({
      data: {
        companyId,
        aggregateType: 'journal',
        aggregateId: 'x',
        eventType: 'accounting.journal.reversed',
        payload: {},
      },
    });
    await dispatcher.drain();
    let row = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: e.id } });
    expect(row).toMatchObject({
      attempts: 1,
      publishedAt: null,
      deadLetteredAt: null,
      lastError: 'journal reversal event without journal ids',
    });
    expect(row.availableAt.getTime()).toBeGreaterThan(Date.now());
    await prisma.outboxEvent.update({
      where: { id: e.id },
      data: { attempts: MAX_ATTEMPTS - 1, availableAt: new Date() },
    });
    await dispatcher.drain();
    row = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: e.id } });
    expect(row.deadLetteredAt).not.toBeNull();
    expect(row.attempts).toBe(MAX_ATTEMPTS);
    const health = (await api(app).get('/health/ready').expect(200)).body;
    expect(health.events.deadLettered).toBeGreaterThanOrEqual(1);
    expect(health.status).toBe('up'); // information only: dead letters do not take the API down
    await prisma.outboxEvent.delete({ where: { id: e.id } });
  });

  it('housekeeping deletes old read notifications and old delivered events, never dead letters', async () => {
    const old = new Date(Date.now() - 200 * 86_400_000);
    const e = await prisma.outboxEvent.create({
      data: {
        companyId,
        aggregateType: 'x',
        aggregateId: 'x',
        eventType: 'test.old',
        payload: {},
        publishedAt: old,
      },
    });
    const dead = await prisma.outboxEvent.create({
      data: {
        companyId,
        aggregateType: 'x',
        aggregateId: 'x',
        eventType: 'test.dead',
        payload: {},
        deadLetteredAt: old,
      },
    });
    const n = await prisma.notification.create({
      data: {
        companyId,
        userId: ids.poster!,
        eventId: randomUUID(),
        kind: 'role_changed',
        params: {},
        readAt: old,
        createdAt: old,
      },
    });
    await dispatcher.housekeeping();
    expect(await prisma.outboxEvent.findUnique({ where: { id: e.id } })).toBeNull();
    expect(await prisma.notification.findUnique({ where: { id: n.id } })).toBeNull();
    expect(await prisma.outboxEvent.findUnique({ where: { id: dead.id } })).not.toBeNull();
    await prisma.outboxEvent.delete({ where: { id: dead.id } });
  });

  it('the database refuses links that leave the company area', async () => {
    await expect(
      prisma.$executeRaw`INSERT INTO platform.notification (company_id, user_id, event_id, kind, params, link)
        VALUES (${companyId}::uuid, ${ids.poster}::uuid, gen_random_uuid(), 'role_changed', '{}', '//evil.test/x')`,
    ).rejects.toThrow(/notification_link_internal/);
  });
});

describe('inbox API', () => {
  it('lists newest first with unread count, pages, filters and marks read', async () => {
    const t = tok.poster!;
    const all = (await api(app, t).get(`${base()}/notifications?limit=1`).expect(200)).body;
    expect(all.items).toHaveLength(1);
    expect(all.unreadCount).toBe((await inbox(ids.poster!)).filter((n) => !n.readAt).length);
    const page2 = (
      await api(app, t).get(`${base()}/notifications?limit=1&cursor=${all.nextCursor}`).expect(200)
    ).body;
    expect(page2.items[0].id).not.toBe(all.items[0].id);
    expect(new Date(page2.items[0].createdAt) <= new Date(all.items[0].createdAt)).toBe(true);
    const read = (await api(app, t).post(`${base()}/notifications/${all.items[0].id}/read`).expect(200)).body;
    expect(read.readAt).not.toBeNull();
    const unread = (await api(app, t).get(`${base()}/notifications?unreadOnly=true&limit=100`).expect(200))
      .body;
    expect(unread.items.map((i: { id: string }) => i.id)).not.toContain(all.items[0].id);
    expect((await api(app, t).get(`${base()}/notifications/unread-count`).expect(200)).body.unreadCount).toBe(
      unread.items.length,
    );
    await api(app, t).post(`${base()}/notifications/read-all`).expect(200);
    expect((await api(app, t).get(`${base()}/notifications/unread-count`).expect(200)).body.unreadCount).toBe(
      0,
    );
  });

  it('nobody can see or mark anyone else’s notifications; outsiders do not see the company', async () => {
    const mine = (await inbox(ids.poster!))[0]!;
    await api(app, tok.admin).post(`${base()}/notifications/${mine.id}/read`).expect(404);
    const outsider = await auth.sign((await createUser(prisma)).sub);
    await api(app, outsider).get(`${base()}/notifications`).expect(404);
    await api(app, outsider).get(`${base()}/notifications/unread-count`).expect(404);
    await api(app, tok.poster).get(`${base()}/notifications?cursor=bad cursor`).expect(400);
  });
});

describe('background delivery', () => {
  it('with the dispatcher on, a business action reaches the inbox without anyone calling drain()', async () => {
    const live = await bootApp({ OUTBOX_DISPATCHER: 'on', OUTBOX_POLL_MS: '200' });
    try {
      const admin = await prisma.user.findUniqueOrThrow({ where: { id: ids.admin } });
      const t = await live.auth.sign(admin.oidcSubject);
      const extra = (
        await api(live.app, t)
          .post(`${base()}/roles`, {
            code: `l-${uid()}`,
            name: 'Live role',
            permissions: ['accounting.account.read'],
          })
          .expect(201)
      ).body.id;
      await api(live.app, t)
        .post(`${base()}/role-assignments`, { userId: ids.viewer, roleId: extra, branchId: ids.DOH })
        .expect(201);
      let found = false;
      for (let i = 0; i < 50 && !found; i++) {
        await new Promise((r) => setTimeout(r, 100));
        found = (await inbox(ids.viewer!)).some(
          (n) => n.kind === 'role_granted' && (n.params as { role: string }).role === 'Live role',
        );
      }
      expect(found).toBe(true);
    } finally {
      await live.prisma.$disconnect();
      await live.app.close();
    }
  });
});
