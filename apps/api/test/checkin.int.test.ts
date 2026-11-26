import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { INSPECTION_ITEMS, PHOTO_LIMITS } from '@erp/validation';
import sharp from 'sharp';
import request from 'supertest';
import { api, bootApp, createUser, uid, type TestAuth } from './helpers';

// WEB-015 check-in inspection and vehicle photos: completeness, who may do what, evidence locked
// after authorisation (API and database), image safety (re-encoded, metadata removed), limits.

let app: INestApplication;
let auth: TestAuth;
let prisma: PrismaClient;
let companyId: string;
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};
const base = () => `/companies/${companyId}`;
const allOk = () => INSPECTION_ITEMS.map((i) => ({ key: i.key, status: 'ok' }));

const binary = (res: request.Response, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};
const upload = (t: string, jobId: string, files: Buffer[], area = 'front', caption?: string) => {
  let r = request(app.getHttpServer())
    .post(`/api/v1${base()}/jobs/${jobId}/photos`)
    .set('Authorization', `Bearer ${t}`)
    .field('area', area);
  if (caption) r = r.field('caption', caption);
  files.forEach((f, i) => (r = r.attach('files', f, `photo-${i}.jpg`)));
  return r;
};
const image = (w = 64, h = 48) =>
  sharp({ create: { width: w, height: h, channels: 3, background: '#aa3311' } });

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
async function newJob() {
  return (
    await api(app, tok.advisor)
      .post(`${base()}/jobs`, {
        branchId: ids.DOH,
        vehicleId: ids.vehicle,
        complaint: 'Rattle from the front',
        odometerIn: 50000,
        fuelLevel: 'half',
        tasks: [{ description: 'Inspect suspension', estimatedHours: '1' }],
      })
      .expect(201)
  ).body as { id: string; version: number };
}

beforeAll(async () => {
  ({ app, auth, prisma } = await bootApp());
  const admin = await createUser(prisma, { platformAdmin: true });
  tok.admin = await auth.sign(admin.sub);
  const c = api(app, tok.admin);
  companyId = (
    await c
      .post('/companies', {
        code: `K${uid()}`,
        legalName: 'Check-in fixture',
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
    ids.DOH!,
  );
  await person('tech', ['workshop.job.read', 'workshop.job.work'], ids.DOH!);
  await person('wakAdvisor', ['workshop.job.read', 'workshop.job.manage'], ids.WAK!);
  const customer = (
    await api(app, tok.advisor)
      .post(`${base()}/customers`, { name: 'Noor', phone: '+97455550202' })
      .expect(201)
  ).body.id;
  ids.vehicle = (
    await api(app, tok.advisor)
      .post(`${base()}/vehicles`, { customerId: customer, plate: 'K 77', make: 'Kia', model: 'Sportage' })
      .expect(201)
  ).body.id;
});

afterAll(async () => {
  await prisma.$disconnect();
  await app.close();
});

describe('check-in inspection', () => {
  it('is recorded by managers, complete, with notes for anything that needs attention', async () => {
    const j = await newJob();
    ids.job = j.id;
    const act = (t: string, body: object) => api(app, t).post(`${base()}/jobs/${j.id}/inspection`, body);
    await act(tok.tech!, { version: 1, items: allOk() }).expect(403);
    await act(tok.advisor!, { version: 1, items: allOk().slice(1) }).expect(400);
    const noNote = allOk().map((i) => (i.key === 'body' ? { ...i, status: 'attention' } : i));
    await act(tok.advisor!, { version: 1, items: noNote }).expect(400);
    const items = allOk().map((i) =>
      i.key === 'body' ? { key: 'body', status: 'attention', note: 'Dent on rear left door' } : i,
    );
    const r = (await act(tok.advisor!, { version: 1, items: [...items].reverse() }).expect(200)).body;
    expect(r.inspection.items.map((i: { key: string }) => i.key)).toEqual(INSPECTION_ITEMS.map((i) => i.key)); // checklist order
    expect(r.inspection.items[0]).toEqual({
      key: 'body',
      status: 'attention',
      note: 'Dent on rear left door',
    });
    expect(r.inspection.recordedByName).toBe('advisor');
    expect(r.events.at(-1).kind).toBe('inspection');
    // Recording again replaces the answers.
    const again = (await act(tok.advisor!, { version: r.version, items: allOk() }).expect(200)).body;
    expect(again.inspection.items.every((i: { status: string }) => i.status === 'ok')).toBe(true);
  });

  it('is locked once the customer authorises the work (API and database)', async () => {
    let j = (await api(app, tok.advisor).get(`${base()}/jobs/${ids.job}`).expect(200)).body;
    j = (
      await api(app, tok.advisor)
        .post(`${base()}/jobs/${ids.job}/authorize`, {
          version: j.version,
          authorizedByName: 'Noor',
          authorizedVia: 'in_person',
        })
        .expect(200)
    ).body;
    await api(app, tok.advisor)
      .post(`${base()}/jobs/${ids.job}/inspection`, { version: j.version, items: allOk() })
      .expect(409);
    await expect(
      prisma.$executeRaw`UPDATE workshop.inspection_item SET status = 'attention', note = 'x' WHERE job_id = ${ids.job}::uuid`,
    ).rejects.toThrow(/only change while the job is a draft/);
    await expect(
      prisma.$executeRaw`UPDATE workshop.job_card SET inspected_at = NULL, inspected_by = NULL WHERE id = ${ids.job}::uuid`,
    ).rejects.toThrow(/job_inspected_after_draft/);
  });
});

describe('vehicle photos', () => {
  it('are re-encoded: metadata such as GPS is removed, large images scaled, thumbnails made', async () => {
    const j = await newJob();
    ids.photoJob = j.id;
    const withGps = await image(3000, 2000)
      .jpeg()
      .withExif({ IFD0: { Make: 'PhoneCo' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '25/1 17/1 0/1' } })
      .toBuffer();
    const r = (await upload(tok.advisor!, j.id, [withGps], 'damage', 'Dent rear left').expect(200)).body;
    expect(r.photos).toHaveLength(1);
    expect(r.photos[0]).toMatchObject({
      area: 'damage',
      caption: 'Dent rear left',
      width: 2048,
      height: 1365,
      uploadedByName: 'advisor',
    });
    const pid = r.photos[0].id;
    ids.photo = pid;
    const full = await request(app.getHttpServer())
      .get(`/api/v1${base()}/jobs/${j.id}/photos/${pid}`)
      .set('Authorization', `Bearer ${tok.tech}`)
      .buffer(true)
      .parse(binary)
      .expect(200);
    expect(full.headers['content-type']).toBe('image/jpeg');
    expect(full.headers['cache-control']).toBe('private, max-age=86400, immutable');
    expect(full.headers['x-content-type-options']).toBe('nosniff');
    const meta = await sharp(full.body as Buffer).metadata();
    expect(meta.exif).toBeUndefined();
    const thumb = await request(app.getHttpServer())
      .get(`/api/v1${base()}/jobs/${j.id}/photos/${pid}?size=thumb`)
      .set('Authorization', `Bearer ${tok.advisor}`)
      .buffer(true)
      .parse(binary)
      .expect(200);
    expect((await sharp(thumb.body as Buffer).metadata()).width).toBe(320);
    const row = await prisma.jobPhoto.findUniqueOrThrow({ where: { id: pid } });
    expect(row.sizeBytes).toBe(row.content.length);
    expect(Buffer.from(row.content).includes(Buffer.from('PhoneCo'))).toBe(false);
  });

  it('refuses files that are not images, too many files and oversized files; nothing is stored', async () => {
    const before = await prisma.jobPhoto.count({ where: { jobId: ids.photoJob } });
    const bad = await upload(tok.advisor!, ids.photoJob!, [
      await image().jpeg().toBuffer(),
      Buffer.from('<?php echo 1;'),
    ]).expect(422);
    expect(bad.body.detail).toMatch(/not a supported image/);
    const six = await Promise.all(Array.from({ length: 6 }, () => image().jpeg().toBuffer()));
    const tooMany = await upload(tok.advisor!, ids.photoJob!, six);
    expect([400, 413]).toContain(tooMany.status);
    const huge = Buffer.alloc(PHOTO_LIMITS.maxBytes + 1, 1);
    expect((await upload(tok.advisor!, ids.photoJob!, [huge])).status).toBe(413);
    await upload(tok.advisor!, ids.photoJob!, [await image().jpeg().toBuffer()], 'roof').expect(400);
    expect(await prisma.jobPhoto.count({ where: { jobId: ids.photoJob } })).toBe(before);
  });

  it('technicians add photos only on jobs they work on; only managers remove, only in a draft', async () => {
    const png = await image().png().toBuffer();
    await upload(tok.tech!, ids.photoJob!, [png]).expect(403);
    let j = (await api(app, tok.advisor).get(`${base()}/jobs/${ids.photoJob}`).expect(200)).body;
    await api(app, tok.tech).delete(`${base()}/jobs/${ids.photoJob}/photos/${ids.photo}`).expect(403);
    const extra = (await upload(tok.advisor!, ids.photoJob!, [png], 'other').expect(200)).body.photos.at(
      -1,
    ).id;
    j = (await api(app, tok.advisor).delete(`${base()}/jobs/${ids.photoJob}/photos/${extra}`).expect(200))
      .body;
    expect(j.photos.map((p: { id: string }) => p.id)).not.toContain(extra);
    expect(j.events.map((e: { kind: string }) => e.kind)).toEqual(
      expect.arrayContaining(['photo_added', 'photo_removed']),
    );
    // Authorise and assign the technician; photos are now evidence.
    j = (
      await api(app, tok.advisor)
        .post(`${base()}/jobs/${ids.photoJob}/inspection`, { version: j.version, items: allOk() })
        .expect(200)
    ).body;
    j = (
      await api(app, tok.advisor)
        .post(`${base()}/jobs/${ids.photoJob}/authorize`, {
          version: j.version,
          authorizedByName: 'Noor',
          authorizedVia: 'phone',
        })
        .expect(200)
    ).body;
    j = (
      await api(app, tok.advisor)
        .post(`${base()}/jobs/${ids.photoJob}/tasks/${j.tasks[0].id}/assign`, {
          version: j.version,
          technicianId: ids.tech,
        })
        .expect(200)
    ).body;
    const found = (await upload(tok.tech!, ids.photoJob!, [png], 'damage', 'Worn bush found').expect(200))
      .body;
    expect(found.photos.at(-1).uploadedByName).toBe('tech');
    await api(app, tok.advisor).delete(`${base()}/jobs/${ids.photoJob}/photos/${ids.photo}`).expect(409);
    await expect(
      prisma.$executeRaw`DELETE FROM workshop.job_photo WHERE id = ${ids.photo}::uuid`,
    ).rejects.toThrow(/evidence/);
    await expect(
      prisma.$executeRaw`UPDATE workshop.job_photo SET caption = 'x' WHERE id = ${ids.photo}::uuid`,
    ).rejects.toThrow(/immutable/);
  });

  it('photos of another branch do not exist for its staff; audit records hashes, never image bytes', async () => {
    await api(app, tok.wakAdvisor).get(`${base()}/jobs/${ids.photoJob}/photos/${ids.photo}`).expect(404);
    await upload(tok.wakAdvisor!, ids.photoJob!, [await image().jpeg().toBuffer()]).expect(404);
    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { entityId: ids.photoJob, action: 'workshop.job.photo_add' },
    });
    expect((audit.after as { sha256: string[] }).sha256[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(audit.after).length).toBeLessThan(2000);
  });

  it('a job holds at most the photo limit', async () => {
    const j = await newJob();
    const five = await Promise.all(Array.from({ length: 5 }, () => image(16, 16).jpeg().toBuffer()));
    for (let i = 0; i < PHOTO_LIMITS.maxPerJob / 5; i++) await upload(tok.advisor!, j.id, five).expect(200);
    const over = await upload(tok.advisor!, j.id, [five[0]!]).expect(422);
    expect(over.body.detail).toMatch(`at most ${PHOTO_LIMITS.maxPerJob} photos`);
  });
});
