import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import ExcelJS from 'exceljs';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { ExportBuilders } from '../src/exports/builders';
import { ExportService } from '../src/exports/export.service';
import { api, bootApp, createUser, uid, type TestAuth } from './helpers';

// WEB-205 export centre: file equals the screen, per-kind permission and branch scope at request,
// generation and download, replay-safe processing, retention, limits and audit.

let app: INestApplication;
let auth: TestAuth;
let prisma: PrismaClient;
let exportsSvc: ExportService;
let token: string;
let companyId: string;
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};

const base = () => `/companies/${companyId}`;
const parseCsv = (buf: Buffer) => {
  expect([...buf.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  // Fixture values contain no commas or quotes, so a plain split is exact here.
  return buf
    .subarray(3)
    .toString('utf8')
    .trimEnd()
    .split('\r\n')
    .map((l) => l.split(','));
};
const binary = (res: request.Response, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};
async function requestExport(body: object, t = token) {
  return (await api(app, t).post(`${base()}/exports`, body).expect(202)).body as {
    id: string;
    status: string;
  };
}
async function runAndDownload(id: string, t = token) {
  expect(await exportsSvc.process(id)).toBe('done');
  const job = (await api(app, t).get(`${base()}/exports/${id}`).expect(200)).body;
  expect(job.status).toBe('succeeded');
  const res = await request(app.getHttpServer())
    .get(`/api/v1${base()}/exports/${id}/download`)
    .set('Authorization', `Bearer ${t}`)
    .buffer(true)
    .parse(binary)
    .expect(200);
  return { job, res, body: res.body as Buffer };
}

beforeAll(async () => {
  ({ app, auth, prisma } = await bootApp());
  exportsSvc = app.get(ExportService);
  const admin = await createUser(prisma, { platformAdmin: true });
  ids.admin = admin.id;
  token = await auth.sign(admin.sub);
  const c = api(app, token);
  companyId = (
    await c
      .post('/companies', {
        code: `X${uid()}`,
        legalName: 'Export fixture',
        legalNameAr: 'شركة التصدير',
        baseCurrency: 'QAR',
        timezone: 'Asia/Qatar',
        initialAdminUserId: admin.id,
      })
      .expect(201)
  ).body.id;
  for (const k of ['DOH', 'WAK']) {
    ids[k] = (await c.post(`${base()}/branches`, { code: k, name: k }).expect(201)).body.id;
  }
  ids.HDR = (
    await c
      .post(`${base()}/accounts`, { code: '1', name: 'Assets', type: 'asset', isPosting: false })
      .expect(201)
  ).body.id;
  for (const [k, code, name, nameAr, type, parentId] of [
    ['CASH', '1100', 'Cash', 'الصندوق', 'asset', 'HDR'],
    ['CAP', '3100', 'Capital', 'رأس المال', 'equity', null],
    ['SALES', '4100', 'Sales', 'المبيعات', 'revenue', null],
  ] as const) {
    ids[k] = (
      await c
        .post(`${base()}/accounts`, {
          code,
          name,
          nameAr,
          type,
          isPosting: true,
          ...(parentId ? { parentId: ids[parentId] } : {}),
        })
        .expect(201)
    ).body.id;
  }
  await c
    .post(`${base()}/fiscal-periods`, { name: 'FY2026', startDate: '2026-01-01', endDate: '2026-12-31' })
    .expect(201);
  const post = (
    date: string,
    description: string,
    branchId: string | null,
    dr: string,
    cr: string,
    amount: string,
  ) =>
    c
      .post(
        `${base()}/journals`,
        {
          postingDate: date,
          description,
          ...(branchId ? { branchId } : {}),
          lines: [
            { accountId: ids[dr], debit: amount, credit: '0' },
            { accountId: ids[cr], debit: '0', credit: amount },
          ],
        },
        { 'Idempotency-Key': randomUUID() },
      )
      .expect(201);
  await post('2026-01-05', 'Capital', null, 'CASH', 'CAP', '1000');
  await post('2026-02-01', 'Sale one', ids.DOH!, 'CASH', 'SALES', '200');
  await post('2026-02-02', 'Sale two', ids.WAK!, 'CASH', 'SALES', '50.25');
  await post('2026-03-01', 'Sale three', ids.DOH!, 'CASH', 'SALES', '10');

  const role = async (permissions: string[]) =>
    (await c.post(`${base()}/roles`, { code: `r-${uid()}`, name: 'r', permissions }).expect(201)).body
      .id as string;
  const member = async (roleId: string, branchId: string | null) => {
    const u = await createUser(prisma);
    const a = await c.post(`${base()}/role-assignments`, { userId: u.id, roleId, branchId }).expect(201);
    return { id: u.id, assignmentId: a.body.id as string, token: await auth.sign(u.sub) };
  };
  const doh = await member(await role(['accounting.journal.read']), ids.DOH!);
  tok.doh = doh.token;
  const peer = await member(await role(['accounting.journal.read', 'reports.financial.read']), null);
  tok.peer = peer.token;
  ids.peerAssignment = peer.assignmentId;
});

afterAll(async () => {
  ExportBuilders.glPageSize = 500;
  await prisma.$disconnect();
  await app.close();
});

describe('export files equal the screens', () => {
  it('trial balance CSV: same rows, debit/credit split of the same balances, totals; replay is a no-op', async () => {
    const params = { from: '2026-02-01', to: '2026-03-31' };
    const job = await requestExport({ kind: 'trial_balance', format: 'csv', params });
    expect(job.status).toBe('queued');
    const { job: done, body, res } = await runAndDownload(job.id);
    expect(await exportsSvc.process(job.id)).toBe('skipped'); // queue replay
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toMatch(
      /attachment; filename="trial-balance_X[0-9a-f]+_2026-02-01_2026-03-31\.csv"/,
    );
    expect(res.headers['cache-control']).toBe('no-store');

    const screen = (
      await api(app, token).get(`${base()}/reports/trial-balance?from=2026-02-01&to=2026-03-31`).expect(200)
    ).body;
    const csv = parseCsv(body);
    expect(csv[0]).toEqual([
      'Code',
      'Account',
      'Level',
      'Header account',
      'Opening debit',
      'Opening credit',
      'Period debit',
      'Period credit',
      'Closing debit',
      'Closing credit',
    ]);
    const data = csv.slice(1, -1);
    expect(data.map((r) => r[0])).toEqual(
      screen.rows.map((r: { account: { code: string } }) => r.account.code),
    );
    for (const [i, r] of screen.rows.entries()) {
      const closing = r.closing as string;
      const expected = closing.startsWith('-')
        ? ['', closing.slice(1)]
        : /^0(\.0+)?$/.test(closing)
          ? ['', '']
          : [closing, ''];
      expect(data[i]!.slice(8)).toEqual(expected);
      expect(data[i]!.slice(6, 8)).toEqual([r.periodDebit, r.periodCredit]);
    }
    expect(csv.at(-1)).toEqual([
      '',
      'Totals',
      '',
      '',
      screen.totals.openingDebit,
      screen.totals.openingCredit,
      screen.totals.periodDebit,
      screen.totals.periodCredit,
      screen.totals.closingDebit,
      screen.totals.closingCredit,
    ]);
    expect(done.rowCount).toBe(screen.rows.length + 1);
  });

  it('trial balance Excel in Arabic: right-to-left, Arabic labels and names, numeric money, About sheet', async () => {
    const job = await requestExport({
      kind: 'trial_balance',
      format: 'xlsx',
      locale: 'ar',
      params: { from: '2026-01-01', to: '2026-12-31' },
    });
    const { body, res } = await runAndDownload(job.id);
    expect(res.headers['content-type']).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(body as unknown as ArrayBuffer);
    const ws = wb.getWorksheet('ميزان المراجعة')!;
    expect(ws.views[0]?.rightToLeft).toBe(true);
    expect(ws.getCell('B1').value).toBe('الحساب');
    const cash = ws.getRows(2, ws.rowCount - 1)!.find((r) => r.getCell(1).value === '1100')!;
    expect(cash.getCell(2).value).toBe('الصندوق');
    expect(cash.getCell(9).value).toBe(1260.25); // 1000 + 200 + 50.25 + 10, debit
    expect(cash.getCell(9).numFmt).toBe('#,##0.00');
    const about = wb.getWorksheet('حول الملف')!;
    const meta = Object.fromEntries(
      about
        .getSheetValues()
        .filter(Boolean)
        .map((r) => [(r as string[])[1], (r as string[])[2]]),
    );
    expect(meta).toMatchObject({ الشركة: 'شركة التصدير', متوازن: 'نعم', العملة: 'QAR' });
  });

  it('general ledger collects every page; balances equal the screen', async () => {
    ExportBuilders.glPageSize = 2; // 4 cash lines → 2 pages
    const job = await requestExport({
      kind: 'general_ledger',
      format: 'csv',
      params: { accountId: ids.CASH, from: '2026-01-01', to: '2026-12-31' },
    });
    const { body } = await runAndDownload(job.id);
    ExportBuilders.glPageSize = 500;
    const rows = parseCsv(body);
    const screen = (
      await api(app, token)
        .get(`${base()}/reports/general-ledger?accountId=${ids.CASH}&from=2026-01-01&to=2026-12-31`)
        .expect(200)
    ).body;
    expect(rows).toHaveLength(1 + 1 + screen.lines.length + 1);
    expect(rows.slice(2, -1).map((r) => [r[1], r[4], r[5], r[6], r[7]])).toEqual(
      screen.lines.map((l: { journalNumber: string; debit: string; credit: string; balance: string }) => [
        l.journalNumber,
        l.debit,
        l.credit,
        l.balance,
        'Dr',
      ]),
    );
    expect(rows.at(-1)!.slice(2)).toEqual(['Closing balance', '', '1260.25', '0.00', '1260.25', 'Dr']);
  });

  it('journal lines with a branch filter contain only that branch, with totals', async () => {
    const job = await requestExport({
      kind: 'journal_lines',
      format: 'csv',
      params: { from: '2026-01-01', to: '2026-12-31', branchId: ids.DOH },
    });
    const rows = parseCsv((await runAndDownload(job.id)).body);
    expect(rows.slice(1, -1).map((r) => r[3])).toEqual(['DOH', 'DOH', 'DOH', 'DOH']);
    expect(rows.at(-1)!.slice(8)).toEqual(['210.00', '210.00']);
  });
});

describe('report exports (RPT R2b2) equal their screens', () => {
  const range = { from: '2026-01-01', to: '2026-12-31' };
  const n = (v: string | undefined | null) => Number(v ?? 0);

  it('every new report kind produces a file with a header row', async () => {
    for (const [kind, params] of [
      ['profit_and_loss', { ...range, compare: 'none' }],
      ['balance_sheet', { to: '2026-12-31' }],
      ['receivables_aging', { to: '2026-12-31' }],
      ['payables_aging', { to: '2026-12-31' }],
      ['cash_flow', range],
      ['tax_summary', range],
      ['sales', range],
      ['stock_movement', range],
    ] as const) {
      const job = await requestExport({ kind, format: 'csv', params });
      const { res, body } = await runAndDownload(job.id);
      expect(res.headers['content-disposition']).toContain(kind.replace(/_/g, '-'));
      expect(parseCsv(body)[0]!.length).toBeGreaterThan(1);
    }
  });

  it('profit and loss: each account and the net profit equal the report', async () => {
    const screen = (
      await api(app, token)
        .get(`${base()}/reports/profit-and-loss?from=2026-02-01&to=2026-02-28&compare=previous`)
        .expect(200)
    ).body;
    const job = await requestExport({
      kind: 'profit_and_loss',
      format: 'csv',
      params: { from: '2026-02-01', to: '2026-02-28' },
    });
    const rows = parseCsv((await runAndDownload(job.id)).body);
    expect(rows[0]!.length).toBe(5); // compare defaults to the previous period
    const sales = rows.find((r) => r[0] === '4100')!;
    expect(n(sales[2])).toBe(n(screen.revenue.lines[0].amount));
    expect(n(sales[2])).toBe(250.25);
    expect(n(rows.at(-1)![2])).toBe(n(screen.netProfit.amount));
  });

  it('balance sheet as of a date: cash, capital and unclosed result equal the report; "from" is refused', async () => {
    const screen = (await api(app, token).get(`${base()}/reports/balance-sheet?asOf=2026-02-28`).expect(200))
      .body;
    const job = await requestExport({ kind: 'balance_sheet', format: 'xlsx', params: { to: '2026-02-28' } });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await runAndDownload(job.id)).body as unknown as ArrayBuffer);
    const values = wb.worksheets[0]!.getSheetValues().filter(Boolean) as unknown[][];
    const byCode = (code: string) => values.find((r) => r.includes(code));
    expect(Number(byCode('1100')!.at(-1))).toBe(1250.25);
    expect(Number(byCode('1100')!.at(-1))).toBe(
      n(screen.assets.lines.find((l: { code: string }) => l.code === '1100').amount),
    );
    expect(Number(byCode('3100')!.at(-1))).toBe(1000);
    expect(Number(values.at(-1)!.at(-1))).toBe(n(screen.totalLiabilitiesAndEquity));
    await api(app, token)
      .post(`${base()}/exports`, {
        kind: 'balance_sheet',
        format: 'csv',
        params: { from: '2026-01-01', to: '2026-02-28' },
      })
      .expect(400);
  });

  it('each kind needs the permission of its screen', async () => {
    // doh holds accounting.journal.read only; peer has no inventory.read.
    await api(app, tok.doh!)
      .post(`${base()}/exports`, { kind: 'profit_and_loss', format: 'csv', params: range })
      .expect(403);
    await api(app, tok.peer!)
      .post(`${base()}/exports`, { kind: 'stock_movement', format: 'csv', params: range })
      .expect(403);
  });
});

describe('export authorization', () => {
  it('branch-limited staff get only their branch, even without a branch filter', async () => {
    const job = await requestExport(
      { kind: 'journal_lines', format: 'csv', params: { from: '2026-01-01', to: '2026-12-31' } },
      tok.doh,
    );
    const rows = parseCsv((await runAndDownload(job.id, tok.doh)).body);
    expect(new Set(rows.slice(1, -1).map((r) => r[3]))).toEqual(new Set(['DOH']));
    await api(app, tok.doh)
      .post(`${base()}/exports`, {
        kind: 'journal_lines',
        format: 'csv',
        params: { from: '2026-01-01', to: '2026-12-31', branchId: ids.WAK },
      })
      .expect(403);
    await api(app, tok.doh)
      .post(`${base()}/exports`, {
        kind: 'trial_balance',
        format: 'csv',
        params: { from: '2026-01-01', to: '2026-12-31' },
      })
      .expect(403); // needs reports.financial.read
  });

  it('nobody else can list, see or download someone’s export; outsiders do not see the company', async () => {
    const job = await requestExport({
      kind: 'journal_lines',
      format: 'csv',
      params: { from: '2026-01-01', to: '2026-01-31' },
    });
    await exportsSvc.process(job.id);
    expect(
      (await api(app, tok.peer).get(`${base()}/exports`).expect(200)).body.map((j: { id: string }) => j.id),
    ).not.toContain(job.id);
    await api(app, tok.peer).get(`${base()}/exports/${job.id}`).expect(404);
    await api(app, tok.peer).get(`${base()}/exports/${job.id}/download`).expect(404);
    const outsider = await auth.sign((await createUser(prisma)).sub);
    await api(app, outsider).get(`${base()}/exports`).expect(404);
    await api(app, outsider)
      .post(`${base()}/exports`, {
        kind: 'journal_lines',
        format: 'csv',
        params: { from: '2026-01-01', to: '2026-01-31' },
      })
      .expect(404);
  });

  it('download re-checks the permission: a removed role blocks a ready file', async () => {
    const job = await requestExport(
      { kind: 'trial_balance', format: 'csv', params: { from: '2026-01-01', to: '2026-01-31' } },
      tok.peer,
    );
    await exportsSvc.process(job.id);
    // Still a member through another role, but no longer allowed the trial balance.
    const other = (
      await api(app, token)
        .post(`${base()}/roles`, { code: `o-${uid()}`, name: 'o', permissions: ['accounting.account.read'] })
        .expect(201)
    ).body.id;
    const peerId = (await prisma.roleAssignment.findUniqueOrThrow({ where: { id: ids.peerAssignment } }))
      .userId;
    await api(app, token)
      .post(`${base()}/role-assignments`, { userId: peerId, roleId: other, branchId: null })
      .expect(201);
    await api(app, token).delete(`${base()}/role-assignments/${ids.peerAssignment}`).expect(204);
    const res = await api(app, tok.peer).get(`${base()}/exports/${job.id}/download`).expect(403);
    expect(res.body.detail).toMatch(/no longer allows/);
  });

  it('a permission removed before processing fails the job with a reason and no file', async () => {
    const r = (
      await api(app, token)
        .post(`${base()}/roles`, { code: `t-${uid()}`, name: 't', permissions: ['reports.financial.read'] })
        .expect(201)
    ).body.id;
    const u = await createUser(prisma);
    const a = (
      await api(app, token)
        .post(`${base()}/role-assignments`, { userId: u.id, roleId: r, branchId: null })
        .expect(201)
    ).body.id;
    const t = await auth.sign(u.sub);
    const job = await requestExport(
      { kind: 'trial_balance', format: 'csv', params: { from: '2026-01-01', to: '2026-01-31' } },
      t,
    );
    await api(app, token).delete(`${base()}/role-assignments/${a}`).expect(204);
    await exportsSvc.process(job.id);
    const row = await prisma.exportJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(row).toMatchObject({
      status: 'failed',
      content: null,
      error: 'Your role no longer allows this report',
    });
  });
});

describe('export lifecycle', () => {
  it('validates the request', async () => {
    const c = api(app, token);
    await c.post(`${base()}/exports`, { kind: 'payroll', format: 'csv', params: {} }).expect(400);
    await c
      .post(`${base()}/exports`, {
        kind: 'journal_lines',
        format: 'pdf',
        params: { from: '2026-01-01', to: '2026-01-31' },
      })
      .expect(400);
    await c
      .post(`${base()}/exports`, {
        kind: 'general_ledger',
        format: 'csv',
        params: { accountId: ids.HDR, from: '2026-01-01', to: '2026-01-31' },
      })
      .expect(422);
    await c
      .post(`${base()}/exports`, {
        kind: 'journal_lines',
        format: 'csv',
        params: { from: '2026-01-01', to: '2026-01-31', branchId: randomUUID() },
      })
      .expect(422);
  });

  it('limits each person to 3 exports in progress', async () => {
    await prisma.exportJob.updateMany({
      where: { requestedBy: ids.admin, status: 'queued' },
      data: { status: 'failed', error: 'test cleanup' },
    });
    const body = { kind: 'journal_lines', format: 'csv', params: { from: '2026-01-01', to: '2026-01-31' } };
    for (let i = 0; i < 3; i++) await requestExport(body);
    const res = await api(app, token).post(`${base()}/exports`, body).expect(429);
    expect(res.body.detail).toMatch(/3 exports in progress/);
    await prisma.exportJob.updateMany({
      where: { requestedBy: ids.admin, status: 'queued' },
      data: { status: 'failed', error: 'test cleanup' },
    });
  });

  it('expired files answer 410 and the sweep deletes their content; interrupted jobs fail visibly', async () => {
    const job = await requestExport({
      kind: 'journal_lines',
      format: 'csv',
      params: { from: '2026-01-01', to: '2026-01-31' },
    });
    await exportsSvc.process(job.id);
    await prisma.exportJob.update({
      where: { id: job.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await api(app, token).get(`${base()}/exports/${job.id}/download`).expect(410);
    const stuck = await requestExport({
      kind: 'journal_lines',
      format: 'csv',
      params: { from: '2026-01-01', to: '2026-01-31' },
    });
    await prisma.exportJob.update({
      where: { id: stuck.id },
      data: { status: 'running', startedAt: new Date(Date.now() - 3_600_000) },
    });
    const r = await exportsSvc.sweep();
    expect(r.expired).toBeGreaterThanOrEqual(1);
    expect(r.interrupted).toBeGreaterThanOrEqual(1);
    expect(await prisma.exportJob.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({
      status: 'expired',
      content: null,
    });
    expect(await prisma.exportJob.findUniqueOrThrow({ where: { id: stuck.id } })).toMatchObject({
      status: 'failed',
    });
  });

  it('the database refuses a "ready" export without a file (and a failure without a reason)', async () => {
    const job = await requestExport({
      kind: 'journal_lines',
      format: 'csv',
      params: { from: '2026-01-01', to: '2026-01-31' },
    });
    await expect(
      prisma.$executeRaw`UPDATE platform.export_job SET status = 'succeeded' WHERE id = ${job.id}::uuid`,
    ).rejects.toThrow(/export_job_file_iff_succeeded/);
    await expect(
      prisma.$executeRaw`UPDATE platform.export_job SET status = 'failed' WHERE id = ${job.id}::uuid`,
    ).rejects.toThrow(/export_job_failed_has_error/);
    await prisma.exportJob.update({
      where: { id: job.id },
      data: { status: 'failed', error: 'test cleanup' },
    });
  });

  it('requests and downloads are in the audit trail, without file contents', async () => {
    const job = await requestExport({
      kind: 'journal_lines',
      format: 'csv',
      params: { from: '2026-01-01', to: '2026-01-31' },
    });
    await runAndDownload(job.id);
    const events = await prisma.auditEvent.findMany({
      where: { entityId: job.id },
      orderBy: { occurredAt: 'asc' },
    });
    expect(events.map((e) => e.action)).toEqual(['export.request', 'export.download']);
    expect(events[1]!.after).toMatchObject({ kind: 'journal_lines', format: 'csv' });
  });
});

describe('background processing through the real queue', () => {
  it('a requested export becomes ready without anyone calling process()', async () => {
    const live = await bootApp({ EXPORT_WORKER: 'on' });
    try {
      const admin = await prisma.user.findUniqueOrThrow({ where: { id: ids.admin } });
      const t = await live.auth.sign(admin.oidcSubject);
      const job = (
        await api(live.app, t)
          .post(`${base()}/exports`, {
            kind: 'trial_balance',
            format: 'xlsx',
            params: { from: '2026-01-01', to: '2026-12-31' },
          })
          .expect(202)
      ).body;
      let status = job.status as string;
      for (let i = 0; i < 50 && (status === 'queued' || status === 'running'); i++) {
        await new Promise((r) => setTimeout(r, 200));
        status = (await api(live.app, t).get(`${base()}/exports/${job.id}`).expect(200)).body.status;
      }
      expect(status).toBe('succeeded');
    } finally {
      await live.prisma.$disconnect();
      await live.app.close();
    }
  });
});
