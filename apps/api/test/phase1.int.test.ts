import type { INestApplication } from '@nestjs/common';
import { Prisma, type PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { api, bootApp, createUser, uid, type TestAuth } from './helpers';

// Phase 1 gate (docs/ROADMAP.md): isolation, balanced journals, reversals — against real PostgreSQL.

let app: INestApplication;
let auth: TestAuth;
let prisma: PrismaClient;

type U = Awaited<ReturnType<typeof createUser>>;
let platformAdmin: U;
let adminA: U; // company-admin of company A
let adminB: U; // company-admin of company B
let companyA: string;
let companyB: string;
let tokens: { platform: string; a: string; b: string };

const key = () => `test-${randomUUID()}`;

async function makeCompany(admin: U, code: string, currency = 'QAR') {
  const res = await api(app, tokens.platform)
    .post('/companies', {
      code,
      legalName: `${code} Trading W.L.L.`,
      legalNameAr: 'شركة اختبار',
      baseCurrency: currency,
      timezone: 'Asia/Qatar',
      initialAdminUserId: admin.id,
    })
    .expect(201);
  return res.body.id as string;
}

async function setupLedger(token: string, companyId: string) {
  const c = api(app, token);
  const header = await c
    .post(`/companies/${companyId}/accounts`, { code: '1', name: 'Assets', type: 'asset', isPosting: false })
    .expect(201);
  const cash = await c
    .post(`/companies/${companyId}/accounts`, {
      code: '1100',
      name: 'Cash',
      nameAr: 'النقدية',
      type: 'asset',
      isPosting: true,
      parentId: header.body.id,
    })
    .expect(201);
  const equity = await c
    .post(`/companies/${companyId}/accounts`, {
      code: '3100',
      name: 'Capital',
      type: 'equity',
      isPosting: true,
    })
    .expect(201);
  const jan = await c
    .post(`/companies/${companyId}/fiscal-periods`, {
      name: '2026-01',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
    })
    .expect(201);
  const feb = await c
    .post(`/companies/${companyId}/fiscal-periods`, {
      name: '2026-02',
      startDate: '2026-02-01',
      endDate: '2026-02-28',
    })
    .expect(201);
  return { header: header.body.id, cash: cash.body.id, equity: equity.body.id, jan: jan.body, feb: feb.body };
}

const journal = (
  cash: string,
  equity: string,
  amount = '1000.00',
  postingDate = '2026-01-15',
  extra = {},
) => ({
  postingDate,
  description: 'Capital injection (synthetic)',
  lines: [
    { accountId: cash, debit: amount },
    { accountId: equity, credit: amount },
  ],
  ...extra,
});

let ledgerA: Awaited<ReturnType<typeof setupLedger>>;
let ledgerB: Awaited<ReturnType<typeof setupLedger>>;

beforeAll(async () => {
  ({ app, auth, prisma } = await bootApp());
  platformAdmin = await createUser(prisma, { platformAdmin: true });
  adminA = await createUser(prisma);
  adminB = await createUser(prisma);
  tokens = {
    platform: await auth.sign(platformAdmin.sub),
    a: await auth.sign(adminA.sub),
    b: await auth.sign(adminB.sub),
  };
  companyA = await makeCompany(adminA, `A${uid()}`);
  companyB = await makeCompany(adminB, `B${uid()}`, 'KWD');
  ledgerA = await setupLedger(tokens.a, companyA);
  ledgerB = await setupLedger(tokens.b, companyB);
});

afterAll(async () => {
  await prisma.$disconnect();
  await app.close();
});

describe('authentication', () => {
  it('rejects a missing token with 401 and WWW-Authenticate', async () => {
    const res = await api(app).get('/me').expect(401);
    expect(res.headers['www-authenticate']).toBe('Bearer');
    expect(res.headers['content-type']).toMatch(/problem\+json/);
  });

  it('rejects a token signed by an unknown key', async () => {
    await api(app, await auth.sign(adminA.sub, { key: auth.otherKey }))
      .get('/me')
      .expect(401);
  });

  it('rejects a wrong issuer, wrong audience and an expired token', async () => {
    await api(app, await auth.sign(adminA.sub, { iss: 'https://evil.test' }))
      .get('/me')
      .expect(401);
    await api(app, await auth.sign(adminA.sub, { aud: 'other-api' }))
      .get('/me')
      .expect(401);
    await api(app, await auth.sign(adminA.sub, { expSeconds: -120 }))
      .get('/me')
      .expect(401);
  });

  it('rejects a valid token for an unprovisioned subject with 403', async () => {
    await api(app, await auth.sign('nobody-' + randomUUID()))
      .get('/me')
      .expect(403);
  });

  it('rejects an inactive user with 403', async () => {
    const u = await createUser(prisma);
    await prisma.user.update({ where: { id: u.id }, data: { status: 'inactive' } });
    await api(app, await auth.sign(u.sub))
      .get('/me')
      .expect(403);
  });

  it('keeps health endpoints public', async () => {
    await api(app).get('/health/live').expect(200);
  });

  it('returns the caller profile with company permissions', async () => {
    const res = await api(app, tokens.a).get('/me').expect(200);
    expect(res.body.user.id).toBe(adminA.id);
    const a = res.body.companies.find((c: { companyId: string }) => c.companyId === companyA);
    expect(a.permissions).toContain('accounting.journal.post');
    expect(res.body.companies.map((c: { companyId: string }) => c.companyId)).not.toContain(companyB);
  });
});

describe('tenant isolation', () => {
  it('only platform admins can create companies', async () => {
    await api(app, tokens.a)
      .post('/companies', {
        code: `X${uid()}`,
        legalName: 'X',
        baseCurrency: 'QAR',
        timezone: 'Asia/Qatar',
        initialAdminUserId: adminA.id,
      })
      .expect(403);
  });

  it('answers 404 (not 403) for a company the caller has no role in', async () => {
    await api(app, tokens.a).get(`/companies/${companyB}`).expect(404);
    await api(app, tokens.a).get(`/companies/${companyB}/journals`).expect(404);
    await api(app, tokens.a).get(`/companies/${randomUUID()}/accounts`).expect(404);
    await api(app, tokens.a).get('/companies/not-a-uuid/accounts').expect(404);
  });

  it('cannot post into another company even with valid account ids', async () => {
    await api(app, tokens.a)
      .post(`/companies/${companyB}/journals`, journal(ledgerB.cash, ledgerB.equity), {
        'Idempotency-Key': key(),
      })
      .expect(404);
  });

  it("cannot use another company's accounts in its own journal", async () => {
    const res = await api(app, tokens.a)
      .post(`/companies/${companyA}/journals`, journal(ledgerA.cash, ledgerB.equity), {
        'Idempotency-Key': key(),
      })
      .expect(422);
    expect(res.body.detail).toMatch(/do not exist in this company/);
  });

  it('lists only companies where the caller holds a role', async () => {
    const res = await api(app, tokens.a).get('/companies').expect(200);
    const ids = res.body.map((c: { id: string }) => c.id);
    expect(ids).toContain(companyA);
    expect(ids).not.toContain(companyB);
  });

  it('database composite keys reject cross-company references even if the API is bypassed', async () => {
    await expect(
      prisma.roleAssignment.create({
        data: {
          companyId: companyA,
          userId: adminA.id,
          roleId: (await prisma.role.findFirstOrThrow({ where: { companyId: companyB } })).id,
        },
      }),
    ).rejects.toThrow(/Foreign key constraint/i);
  });
});

describe('roles, scopes and privilege escalation', () => {
  let branch1: string;
  let branch2: string;
  let clerk: U;
  let clerkToken: string;
  let branchAdmin: U;
  let branchAdminToken: string;

  beforeAll(async () => {
    const c = api(app, tokens.a);
    branch1 = (
      await c
        .post(`/companies/${companyA}/branches`, { code: 'DOH', name: 'Doha', nameAr: 'الدوحة' })
        .expect(201)
    ).body.id;
    branch2 = (
      await c.post(`/companies/${companyA}/branches`, { code: 'WAK', name: 'Al Wakrah' }).expect(201)
    ).body.id;
    const clerkRole = (
      await c
        .post(`/companies/${companyA}/roles`, {
          code: 'branch-clerk',
          name: 'Branch clerk',
          permissions: ['accounting.journal.read', 'accounting.journal.post', 'accounting.account.read'],
        })
        .expect(201)
    ).body.id;
    const branchAdminRole = (
      await c
        .post(`/companies/${companyA}/roles`, {
          code: 'branch-admin',
          name: 'Branch admin',
          permissions: ['iam.assignment.manage', 'iam.assignment.read', 'accounting.journal.read'],
        })
        .expect(201)
    ).body.id;
    clerk = await createUser(prisma);
    branchAdmin = await createUser(prisma);
    clerkToken = await auth.sign(clerk.sub);
    branchAdminToken = await auth.sign(branchAdmin.sub);
    await c
      .post(`/companies/${companyA}/role-assignments`, {
        userId: clerk.id,
        roleId: clerkRole,
        branchId: branch1,
      })
      .expect(201);
    await c
      .post(`/companies/${companyA}/role-assignments`, {
        userId: branchAdmin.id,
        roleId: branchAdminRole,
        branchId: branch1,
      })
      .expect(201);
  });

  it('refuses an action without the permission (403)', async () => {
    await api(app, clerkToken).get(`/companies/${companyA}/audit-events`).expect(403);
    await api(app, clerkToken)
      .post(`/companies/${companyA}/accounts`, { code: '9999', name: 'x', type: 'asset', isPosting: true })
      .expect(403);
  });

  it('branch-scoped user can post only to their branch', async () => {
    const c = api(app, clerkToken);
    await c
      .post(
        `/companies/${companyA}/journals`,
        journal(ledgerA.cash, ledgerA.equity, '10.00', '2026-01-10', { branchId: branch1 }),
        {
          'Idempotency-Key': key(),
        },
      )
      .expect(201);
    await c
      .post(
        `/companies/${companyA}/journals`,
        journal(ledgerA.cash, ledgerA.equity, '10.00', '2026-01-10', { branchId: branch2 }),
        {
          'Idempotency-Key': key(),
        },
      )
      .expect(403);
    await c
      .post(`/companies/${companyA}/journals`, journal(ledgerA.cash, ledgerA.equity, '10.00'), {
        'Idempotency-Key': key(),
      })
      .expect(403);
  });

  it('an idempotent replay never reveals a journal outside the caller scope', async () => {
    // A company-wide admin posts to branch 2; a branch-1 clerk then reuses the same key.
    const k = key();
    const body = journal(ledgerA.cash, ledgerA.equity, '3.00', '2026-01-11', { branchId: branch2 });
    await api(app, tokens.a)
      .post(`/companies/${companyA}/journals`, body, { 'Idempotency-Key': k })
      .expect(201);
    await api(app, clerkToken)
      .post(`/companies/${companyA}/journals`, body, { 'Idempotency-Key': k })
      .expect(403);
    const res = await api(app, clerkToken)
      .post(`/companies/${companyA}/journals`, { ...body, branchId: branch1 }, { 'Idempotency-Key': k })
      .expect(409);
    expect(JSON.stringify(res.body)).not.toContain(branch2);
  });

  it('branch-scoped user sees only journals of their branch', async () => {
    const res = await api(app, clerkToken).get(`/companies/${companyA}/journals?limit=200`).expect(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(res.body.items.every((j: { branchId: string }) => j.branchId === branch1)).toBe(true);
  });

  it('cannot grant permissions it does not hold, or widen scope beyond its branch', async () => {
    const c = api(app, branchAdminToken);
    const roles = (await api(app, tokens.a).get(`/companies/${companyA}/roles`).expect(200)).body as {
      id: string;
      code: string;
    }[];
    const companyAdmin = roles.find((r) => r.code === 'company-admin')!.id;
    const clerkRole = roles.find((r) => r.code === 'branch-clerk')!.id;
    const target = await createUser(prisma);
    // Grants post/read permissions the branch admin lacks → 403.
    await c
      .post(`/companies/${companyA}/role-assignments`, {
        userId: target.id,
        roleId: clerkRole,
        branchId: branch1,
      })
      .expect(403);
    // Self-escalation to company admin → 403.
    await c
      .post(`/companies/${companyA}/role-assignments`, { userId: branchAdmin.id, roleId: companyAdmin })
      .expect(403);
    // Assigning in another branch → 403.
    await c
      .post(`/companies/${companyA}/role-assignments`, {
        userId: target.id,
        roleId: clerkRole,
        branchId: branch2,
      })
      .expect(403);
  });

  it('rejects unknown permissions in a role', async () => {
    await api(app, tokens.a)
      .post(`/companies/${companyA}/roles`, {
        code: 'bad',
        name: 'Bad',
        permissions: ['accounting.everything'],
      })
      .expect(422);
  });

  it('revoking an assignment removes access immediately', async () => {
    const temp = await createUser(prisma);
    const roles = (await api(app, tokens.a).get(`/companies/${companyA}/roles`).expect(200)).body as {
      id: string;
      code: string;
    }[];
    const a = await api(app, tokens.a)
      .post(`/companies/${companyA}/role-assignments`, {
        userId: temp.id,
        roleId: roles.find((r) => r.code === 'branch-clerk')!.id,
      })
      .expect(201);
    const t = await auth.sign(temp.sub);
    await api(app, t).get(`/companies/${companyA}/journals`).expect(200);
    await api(app, tokens.a).delete(`/companies/${companyA}/role-assignments/${a.body.id}`).expect(204);
    await api(app, t).get(`/companies/${companyA}/journals`).expect(404);
  });
});

describe('journal posting', () => {
  const c = () => api(app, tokens.a);

  it('posts a balanced journal with a gapless per-company number, audit and outbox in one transaction', async () => {
    const res = await c()
      .post(`/companies/${companyA}/journals`, journal(ledgerA.cash, ledgerA.equity, '1250.50'), {
        'Idempotency-Key': key(),
      })
      .expect(201);
    expect(res.body.number).toMatch(/^JV-2026-\d{6}$/);
    expect(res.body.totalDebit).toBe('1250.50');
    expect(res.body.lines.map((l: { debit: string; credit: string }) => [l.debit, l.credit])).toEqual([
      ['1250.50', '0.00'],
      ['0.00', '1250.50'],
    ]);
    const audit = await prisma.auditEvent.findFirst({
      where: { entityId: res.body.id, action: 'accounting.journal.post' },
    });
    expect(audit?.actorUserId).toBe(adminA.id);
    const outbox = await prisma.outboxEvent.findFirst({ where: { aggregateId: res.body.id } });
    expect(outbox?.eventType).toBe('accounting.journal.posted');
  });

  it.each([
    [
      'unbalanced',
      {
        lines: [
          { accountId: 'CASH', debit: '100.00' },
          { accountId: 'EQ', credit: '99.99' },
        ],
      },
      422,
      /not balanced/,
    ],
    [
      'both sides on a line',
      {
        lines: [
          { accountId: 'CASH', debit: '1', credit: '1' },
          { accountId: 'EQ', credit: '0' },
        ],
      },
      422,
      /exactly one/,
    ],
    [
      'too many decimals for QAR',
      {
        lines: [
          { accountId: 'CASH', debit: '1.005' },
          { accountId: 'EQ', credit: '1.005' },
        ],
      },
      422,
      /2 decimal/,
    ],
    [
      'money sent as a JSON number',
      {
        lines: [
          { accountId: 'CASH', debit: 10 },
          { accountId: 'EQ', credit: 10 },
        ],
      },
      400,
      /decimal string/,
    ],
    ['a single line', { lines: [{ accountId: 'CASH', debit: '1' }] }, 400, /lines/],
    [
      'header account',
      {
        lines: [
          { accountId: 'HEADER', debit: '1' },
          { accountId: 'EQ', credit: '1' },
        ],
      },
      422,
      /header or inactive/,
    ],
    ['date outside any period', { postingDate: '2027-06-01' }, 422, /No fiscal period/],
  ])('rejects %s', async (_name, patch, status, detail) => {
    const map: Record<string, string> = { CASH: ledgerA.cash, EQ: ledgerA.equity, HEADER: ledgerA.header };
    const body = { ...journal(ledgerA.cash, ledgerA.equity), ...patch } as { lines: { accountId: string }[] };
    body.lines = body.lines.map((l) => ({ ...l, accountId: map[l.accountId] ?? l.accountId }));
    const res = await c()
      .post(`/companies/${companyA}/journals`, body, { 'Idempotency-Key': key() })
      .expect(status);
    expect(JSON.stringify(res.body)).toMatch(detail);
  });

  it('honours the currency of the company (KWD has 3 decimals)', async () => {
    const res = await api(app, tokens.b)
      .post(`/companies/${companyB}/journals`, journal(ledgerB.cash, ledgerB.equity, '10.125'), {
        'Idempotency-Key': key(),
      })
      .expect(201);
    expect(res.body.totalDebit).toBe('10.125');
    expect(res.body.currency).toBe('KWD');
  });

  it('requires an Idempotency-Key', async () => {
    await c().post(`/companies/${companyA}/journals`, journal(ledgerA.cash, ledgerA.equity)).expect(400);
  });

  it('replays the same key and body, and rejects the same key with a different body', async () => {
    const k = key();
    const first = await c()
      .post(`/companies/${companyA}/journals`, journal(ledgerA.cash, ledgerA.equity, '5.00'), {
        'Idempotency-Key': k,
      })
      .expect(201);
    const again = await c()
      .post(`/companies/${companyA}/journals`, journal(ledgerA.cash, ledgerA.equity, '5.00'), {
        'Idempotency-Key': k,
      })
      .expect(200);
    expect(again.headers['idempotent-replayed']).toBe('true');
    expect(again.body.id).toBe(first.body.id);
    await c()
      .post(`/companies/${companyA}/journals`, journal(ledgerA.cash, ledgerA.equity, '6.00'), {
        'Idempotency-Key': k,
      })
      .expect(409);
  });

  it('creates exactly one journal for 10 concurrent requests with the same key', async () => {
    const k = key();
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        c().post(`/companies/${companyA}/journals`, journal(ledgerA.cash, ledgerA.equity, '7.00'), {
          'Idempotency-Key': k,
        }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 200, 200, 200, 200, 200, 200, 200, 200, 201]);
    expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
    expect(await prisma.journal.count({ where: { companyId: companyA, idempotencyKey: k } })).toBe(1);
  });

  it('numbers 20 concurrent postings uniquely and without gaps', async () => {
    const fresh = await makeCompany(adminA, `N${uid()}`);
    const l = await setupLedger(tokens.a, fresh);
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        c().post(`/companies/${fresh}/journals`, journal(l.cash, l.equity, '1.00'), {
          'Idempotency-Key': key(),
        }),
      ),
    );
    expect(results.every((r) => r.status === 201)).toBe(true);
    const numbers = results.map((r) => r.body.number as string).sort();
    expect(numbers).toEqual(
      Array.from({ length: 20 }, (_, i) => `JV-2026-${String(i + 1).padStart(6, '0')}`),
    );
  });

  it('keeps the ledger balanced in total (trial balance check)', async () => {
    const rows = await prisma.$queryRaw<{ d: Prisma.Decimal; c: Prisma.Decimal }[]>`
      SELECT coalesce(sum(debit),0) AS d, coalesce(sum(credit),0) AS c FROM accounting.journal_line WHERE company_id = ${companyA}::uuid`;
    expect(rows[0]!.d.toString()).toBe(rows[0]!.c.toString());
  });

  it('paginates journals with a keyset cursor without duplicates', async () => {
    const seen = new Set<string>();
    let cursor: string | null = null;
    let pages = 0;
    do {
      const url: string = `/companies/${companyA}/journals?limit=3${cursor ? `&cursor=${cursor}` : ''}`;
      const res = await c().get(url).expect(200);
      for (const j of res.body.items) {
        expect(seen.has(j.id)).toBe(false);
        seen.add(j.id);
      }
      cursor = res.body.nextCursor;
      pages++;
    } while (cursor && pages < 100);
    expect(seen.size).toBe(await prisma.journal.count({ where: { companyId: companyA } }));
    await c().get(`/companies/${companyA}/journals?cursor=bogus`).expect(400);
  });
});

describe('reversals', () => {
  const c = () => api(app, tokens.a);

  it('posts a mirror journal, leaves the original unchanged, and allows only one reversal', async () => {
    const orig = await c()
      .post(`/companies/${companyA}/journals`, journal(ledgerA.cash, ledgerA.equity, '300.00'), {
        'Idempotency-Key': key(),
      })
      .expect(201);
    const rev = await c()
      .post(
        `/companies/${companyA}/journals/${orig.body.id}/reverse`,
        { postingDate: '2026-01-20', reason: 'Entered twice' },
        {
          'Idempotency-Key': key(),
        },
      )
      .expect(201);
    expect(rev.body.reversalOfId).toBe(orig.body.id);
    expect(rev.body.lines.map((l: { debit: string; credit: string }) => [l.debit, l.credit])).toEqual([
      ['0.00', '300.00'],
      ['300.00', '0.00'],
    ]);
    const after = await c().get(`/companies/${companyA}/journals/${orig.body.id}`).expect(200);
    expect(after.body.lines).toEqual(orig.body.lines);
    expect(after.body.reversedById).toBe(rev.body.id);
    await c()
      .post(
        `/companies/${companyA}/journals/${orig.body.id}/reverse`,
        { postingDate: '2026-01-21', reason: 'again' },
        {
          'Idempotency-Key': key(),
        },
      )
      .expect(409);
    await c()
      .post(
        `/companies/${companyA}/journals/${rev.body.id}/reverse`,
        { postingDate: '2026-01-21', reason: 'undo' },
        {
          'Idempotency-Key': key(),
        },
      )
      .expect(422);
  });

  it('two concurrent reversals of the same journal produce exactly one', async () => {
    const orig = await c()
      .post(`/companies/${companyA}/journals`, journal(ledgerA.cash, ledgerA.equity, '11.00'), {
        'Idempotency-Key': key(),
      })
      .expect(201);
    const results = await Promise.all(
      [1, 2, 3].map(() =>
        c().post(
          `/companies/${companyA}/journals/${orig.body.id}/reverse`,
          { postingDate: '2026-01-25', reason: 'race' },
          {
            'Idempotency-Key': key(),
          },
        ),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409]);
    expect(await prisma.journal.count({ where: { reversalOfId: orig.body.id } })).toBe(1);
  });

  it('cannot be dated before the original', async () => {
    const orig = await c()
      .post(`/companies/${companyA}/journals`, journal(ledgerA.cash, ledgerA.equity, '12.00', '2026-01-20'), {
        'Idempotency-Key': key(),
      })
      .expect(201);
    await c()
      .post(
        `/companies/${companyA}/journals/${orig.body.id}/reverse`,
        { postingDate: '2026-01-19', reason: 'x'.repeat(5) },
        {
          'Idempotency-Key': key(),
        },
      )
      .expect(422);
  });
});

describe('fiscal periods', () => {
  it('rejects overlapping periods', async () => {
    await api(app, tokens.a)
      .post(`/companies/${companyA}/fiscal-periods`, {
        name: 'overlap',
        startDate: '2026-01-15',
        endDate: '2026-02-15',
      })
      .expect(409);
  });

  it('closing uses optimistic locking, then rejects postings and reversals into the period', async () => {
    const company = await makeCompany(adminA, `P${uid()}`);
    const l = await setupLedger(tokens.a, company);
    const c = api(app, tokens.a);
    const posted = await c
      .post(`/companies/${company}/journals`, journal(l.cash, l.equity, '50.00', '2026-02-10'), {
        'Idempotency-Key': key(),
      })
      .expect(201);
    await c
      .post(`/companies/${company}/fiscal-periods/${l.jan.id}/close`, { version: 99, reason: 'month end' })
      .expect(409);
    const closed = await c
      .post(`/companies/${company}/fiscal-periods/${l.jan.id}/close`, {
        version: l.jan.version,
        reason: 'month end',
      })
      .expect(200);
    expect(closed.body.status).toBe('closed');
    await c
      .post(`/companies/${company}/fiscal-periods/${l.jan.id}/close`, {
        version: closed.body.version,
        reason: 'again',
      })
      .expect(409);
    const res = await c
      .post(`/companies/${company}/journals`, journal(l.cash, l.equity, '1.00', '2026-01-31'), {
        'Idempotency-Key': key(),
      })
      .expect(422);
    expect(res.body.detail).toMatch(/closed/);
    // Reversal of a February journal into closed January is impossible (date rule), and into Feb is fine.
    await c
      .post(
        `/companies/${company}/journals/${posted.body.id}/reverse`,
        { postingDate: '2026-02-11', reason: 'fix' },
        {
          'Idempotency-Key': key(),
        },
      )
      .expect(201);
    const audit = await prisma.auditEvent.findFirst({
      where: { entityId: l.jan.id, action: 'accounting.period.close' },
    });
    expect(audit?.reason).toBe('month end');
  });

  it('a close blocks while a posting holds the period, so nothing lands in a closed period', async () => {
    const company = await makeCompany(adminA, `R${uid()}`);
    const l = await setupLedger(tokens.a, company);
    const c = api(app, tokens.a);

    // Simulate an in-flight posting: hold the same FOR SHARE lock the posting transaction takes.
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    let locked!: () => void;
    const lockTaken = new Promise<void>((r) => (locked = r));
    const inFlight = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM accounting.fiscal_period WHERE id = ${l.jan.id}::uuid FOR SHARE`;
        locked();
        await held;
      },
      { timeout: 20000 },
    );
    await lockTaken;

    let closeFinished = false;
    const close = c
      .post(`/companies/${company}/fiscal-periods/${l.jan.id}/close`, {
        version: l.jan.version,
        reason: 'race',
      })
      .then((r) => {
        closeFinished = true;
        return r;
      });
    await new Promise((r) => setTimeout(r, 800));
    expect(closeFinished).toBe(false); // waiting on the posting's lock
    release();
    await inFlight;
    expect((await close).status).toBe(200);
  });

  it('concurrent postings racing a close are either committed before it or refused', async () => {
    const company = await makeCompany(adminA, `T${uid()}`);
    const l = await setupLedger(tokens.a, company);
    const c = api(app, tokens.a);
    const results = await Promise.all([
      ...Array.from({ length: 8 }, () =>
        c.post(`/companies/${company}/journals`, journal(l.cash, l.equity, '2.00', '2026-01-05'), {
          'Idempotency-Key': key(),
        }),
      ),
      c.post(`/companies/${company}/fiscal-periods/${l.jan.id}/close`, {
        version: l.jan.version,
        reason: 'race',
      }),
    ]);
    expect(results[8]!.status).toBe(200);
    const posts = results.slice(0, 8);
    for (const r of posts) {
      expect([201, 422]).toContain(r.status);
      if (r.status === 422) expect(r.body.detail).toMatch(/closed/);
    }
    const committed = await prisma.journal.count({ where: { companyId: company, fiscalPeriodId: l.jan.id } });
    expect(committed).toBe(posts.filter((r) => r.status === 201).length);
  });
});

describe('database defenses (API bypassed on purpose)', () => {
  it('rejects UPDATE and DELETE of posted journals and lines', async () => {
    const j = await prisma.journal.findFirstOrThrow({ where: { companyId: companyA } });
    await expect(
      prisma.$executeRaw`UPDATE accounting.journal SET description = 'tampered' WHERE id = ${j.id}::uuid`,
    ).rejects.toThrow(/immutable/);
    await expect(
      prisma.$executeRaw`DELETE FROM accounting.journal_line WHERE journal_id = ${j.id}::uuid`,
    ).rejects.toThrow(/immutable/);
    await expect(prisma.$executeRaw`TRUNCATE accounting.journal_line`).rejects.toThrow(/immutable/);
  });

  it('rejects UPDATE and DELETE of audit events', async () => {
    const a = await prisma.auditEvent.findFirstOrThrow();
    await expect(
      prisma.$executeRaw`UPDATE platform.audit_event SET action = 'x' WHERE id = ${a.id}::uuid`,
    ).rejects.toThrow(/immutable/);
    await expect(
      prisma.$executeRaw`DELETE FROM platform.audit_event WHERE id = ${a.id}::uuid`,
    ).rejects.toThrow(/immutable/);
  });

  async function insertJournal(tx: Prisma.TransactionClient, debit: string, credit: string, lines = 2) {
    const id = randomUUID();
    await tx.$executeRaw`
      INSERT INTO accounting.journal (id, company_id, fiscal_period_id, number, posting_date, description, currency,
        total_debit, total_credit, source_type, idempotency_key, request_hash, posted_by)
      VALUES (${id}::uuid, ${companyA}::uuid, ${ledgerA.jan.id}::uuid, ${'RAW-' + uid()}, '2026-01-03', 'raw', 'QAR',
        ${debit}::numeric, ${debit}::numeric, 'manual', ${key()}, 'x', ${adminA.id}::uuid)`;
    await tx.$executeRaw`INSERT INTO accounting.journal_line (company_id, journal_id, line_no, account_id, debit, credit)
      VALUES (${companyA}::uuid, ${id}::uuid, 1, ${ledgerA.cash}::uuid, ${debit}::numeric, 0)`;
    if (lines > 1) {
      await tx.$executeRaw`INSERT INTO accounting.journal_line (company_id, journal_id, line_no, account_id, debit, credit)
        VALUES (${companyA}::uuid, ${id}::uuid, 2, ${ledgerA.equity}::uuid, 0, ${credit}::numeric)`;
    }
    return id;
  }

  it('rolls back an unbalanced journal at commit (deferred constraint)', async () => {
    let id = '';
    await expect(
      prisma.$transaction(async (tx) => {
        id = await insertJournal(tx, '10.00', '9.00');
      }),
    ).rejects.toThrow(/not balanced/);
    expect(await prisma.journal.count({ where: { id } })).toBe(0);
  });

  it('rolls back a single-line journal at commit', async () => {
    await expect(prisma.$transaction((tx) => insertJournal(tx, '10.00', '10.00', 1))).rejects.toThrow(
      /at least two lines/,
    );
  });

  it('accepts a balanced raw journal (control case)', async () => {
    const id = await prisma.$transaction((tx) => insertJournal(tx, '4.00', '4.00'));
    expect(await prisma.journalLine.count({ where: { journalId: id } })).toBe(2);
  });

  it('rejects a line on a header account and a journal in a closed or wrong period', async () => {
    await expect(
      prisma.$executeRaw`INSERT INTO accounting.journal_line (company_id, journal_id, line_no, account_id, debit, credit)
        SELECT company_id, id, 99, ${ledgerA.header}::uuid, 1, 0 FROM accounting.journal WHERE company_id = ${companyA}::uuid LIMIT 1`,
    ).rejects.toThrow(/not an active posting account/);
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
          INSERT INTO accounting.journal (company_id, fiscal_period_id, number, posting_date, description, currency,
            total_debit, total_credit, source_type, idempotency_key, request_hash, posted_by)
          VALUES (${companyA}::uuid, ${ledgerA.feb.id}::uuid, ${'RAW-' + uid()}, '2026-01-03', 'raw', 'QAR', 1, 1, 'manual', ${key()}, 'x', ${adminA.id}::uuid)`;
      }),
    ).rejects.toThrow(/does not match the posting date/);
  });

  it('rejects reopening a closed period', async () => {
    const closed = await prisma.fiscalPeriod.findFirstOrThrow({ where: { status: 'closed' } });
    await expect(
      prisma.$executeRaw`UPDATE accounting.fiscal_period SET status = 'open', closed_at = NULL WHERE id = ${closed.id}::uuid`,
    ).rejects.toThrow(/approval workflow/);
  });
});

describe('audit trail API', () => {
  it('lists company events newest first with actor and request id', async () => {
    const res = await api(app, tokens.a).get(`/companies/${companyA}/audit-events?limit=5`).expect(200);
    expect(res.body.items).toHaveLength(5);
    expect(res.body.items[0].requestId).toBeTruthy();
    const times = res.body.items.map((e: { occurredAt: string }) => e.occurredAt);
    expect([...times].sort().reverse()).toEqual(times);
    expect(res.body.nextCursor).toBeTruthy();
  });

  it('never exposes another company’s events', async () => {
    const res = await api(app, tokens.a).get(`/companies/${companyA}/audit-events?limit=200`).expect(200);
    const ids = new Set(res.body.items.map((e: { entityId: string }) => e.entityId));
    expect(ids.has(companyB)).toBe(false);
  });
});
