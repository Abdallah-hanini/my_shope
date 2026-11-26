import { HttpStatus, type INestApplication } from '@nestjs/common';
import { DomainError } from '../src/common/errors';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/bootstrap';
import { loadApiEnv } from '../src/config/env';
import {
  ProvisioningConflict,
  type IdentityProvisioner,
  type NewIdentity,
} from '../src/iam/identity-provisioner';
import { api, AUDIENCE, createTestAuth, createUser, ISSUER, uid, type TestAuth } from './helpers';

/**
 * In-process stand-in for the identity provider. Integration tests exercise the ERP's rules
 * against real PostgreSQL; the real Keycloak Admin API is exercised by the browser end-to-end
 * test and the production deployment check.
 */
class TestIdentityProvider implements IdentityProvisioner {
  readonly issuer = ISSUER;
  users = new Map<string, NewIdentity & { enabled: boolean; password?: string; sessionsEnded: number }>();
  deleted: string[] = [];
  /** Forces the next createUser to return this subject (to provoke an ERP-side failure). */
  nextSubject?: string;
  /** Makes the next setTemporaryPassword fail, after the account was created. */
  failNextPassword = false;

  async createUser(i: NewIdentity): Promise<string> {
    if ([...this.users.values()].some((u) => u.username === i.username || u.email === i.email))
      throw new ProvisioningConflict();
    const id = this.nextSubject ?? randomUUID();
    this.nextSubject = undefined;
    if (!this.users.has(id)) this.users.set(id, { ...i, enabled: true, sessionsEnded: 0 });
    return id;
  }
  async setTemporaryPassword(subject: string, password: string): Promise<void> {
    if (this.failNextPassword) {
      this.failNextPassword = false;
      throw new DomainError(
        HttpStatus.BAD_GATEWAY,
        'The identity server could not set the temporary password (HTTP 400)',
      );
    }
    this.users.get(subject)!.password = password;
  }
  async setEnabled(subject: string, enabled: boolean): Promise<void> {
    this.users.get(subject)!.enabled = enabled;
  }
  async logoutSessions(subject: string): Promise<void> {
    this.users.get(subject)!.sessionsEnded += 1;
  }
  async deleteUser(subject: string): Promise<void> {
    this.users.delete(subject);
    this.deleted.push(subject);
  }
}

let app: INestApplication;
let auth: TestAuth;
let prisma: PrismaClient;
const idp = new TestIdentityProvider();
let companyId: string;
let otherCompanyId: string;
const ids: Record<string, string> = {};
const tok: Record<string, string> = {};

const staffBody = (o: Partial<Record<string, unknown>> = {}) => ({
  username: `staff.${uid()}`,
  email: `${uid()}@shop.invalid`,
  firstName: 'Staff',
  lastName: 'Member',
  roleId: ids.clerkRole,
  branchId: ids.DOH,
  ...o,
});

beforeAll(async () => {
  const env = loadApiEnv({
    ...process.env,
    LOG_LEVEL: 'error',
    OIDC_ISSUER: ISSUER,
    OIDC_AUDIENCE: AUDIENCE,
    OIDC_JWKS_URL: `${ISSUER}/protocol/openid-connect/certs`,
  });
  const created = await createTestAuth();
  auth = created.auth;
  app = await createApp(env, { bufferLogs: false, keyResolver: created.jwks, provisioner: idp });
  await app.init();
  prisma = new PrismaClient();

  const platform = await createUser(prisma, { platformAdmin: true });
  const owner = await createUser(prisma);
  tok.platform = await auth.sign(platform.sub);
  tok.owner = await auth.sign(owner.sub);
  ids.owner = owner.id;
  ids.platform = platform.id;
  const mk = async (admin: string) =>
    (
      await api(app, tok.platform)
        .post('/companies', {
          code: `S${uid()}`,
          legalName: 'Staff fixture',
          baseCurrency: 'QAR',
          timezone: 'Asia/Qatar',
          initialAdminUserId: admin,
        })
        .expect(201)
    ).body.id as string;
  companyId = await mk(owner.id);
  otherCompanyId = await mk(platform.id);
  const c = api(app, tok.owner);
  ids.DOH = (
    await c.post(`/companies/${companyId}/branches`, { code: 'DOH', name: 'Doha' }).expect(201)
  ).body.id;
  ids.WAK = (
    await c.post(`/companies/${companyId}/branches`, { code: 'WAK', name: 'Wakrah' }).expect(201)
  ).body.id;
  ids.clerkRole = (
    await c
      .post(`/companies/${companyId}/roles`, {
        code: 'clerk',
        name: 'Clerk',
        permissions: ['accounting.journal.read', 'accounting.journal.post'],
      })
      .expect(201)
  ).body.id;
  ids.branchAdminRole = (
    await c
      .post(`/companies/${companyId}/roles`, {
        code: 'branch-admin',
        name: 'Branch admin',
        permissions: [
          'iam.user.manage',
          'iam.assignment.manage',
          'iam.assignment.read',
          'accounting.journal.read',
        ],
      })
      .expect(201)
  ).body.id;
  ids.viewerRole = (
    await c
      .post(`/companies/${companyId}/roles`, {
        code: 'viewer',
        name: 'Viewer',
        permissions: ['accounting.journal.read'],
      })
      .expect(201)
  ).body.id;
});

afterAll(async () => {
  await prisma.$disconnect();
  await app.close();
});

describe('staff onboarding', () => {
  it('creates a sign-in account and an ERP user with the role; the password is returned once and never stored', async () => {
    const body = staffBody({
      username: 'Ahmed.K',
      email: `ahmed.${uid()}@shop.invalid`,
      firstName: 'Ahmed',
      lastName: 'K',
    });
    const res = await api(app, tok.owner).post(`/companies/${companyId}/users`, body).expect(201);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.temporaryPassword).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(res.body.user).toMatchObject({
      displayName: 'Ahmed K',
      status: 'active',
      inOtherCompanies: false,
    });
    expect(res.body.user.assignments).toEqual([
      expect.objectContaining({ roleCode: 'clerk', branchId: ids.DOH }),
    ]);
    ids.clerk = res.body.user.id;

    const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: ids.clerk } });
    const account = idp.users.get(dbUser.oidcSubject)!;
    expect(account).toMatchObject({
      username: 'ahmed.k',
      enabled: true,
      requiredActions: ['UPDATE_PASSWORD', 'CONFIGURE_TOTP'],
    });
    expect(account.password).toBe(res.body.temporaryPassword);
    tok.clerk = await auth.sign(dbUser.oidcSubject);

    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { entityId: ids.clerk, action: 'iam.user.onboard' },
    });
    expect(JSON.stringify(audit)).not.toContain(res.body.temporaryPassword);
    const me = await api(app, tok.clerk).get('/me').expect(200);
    expect(me.body.companies[0].permissions).toEqual(['accounting.journal.post', 'accounting.journal.read']);
  });

  it('any member can read the company header (name, currency) without org.company.read; outsiders get 404', async () => {
    const c = await api(app, tok.clerk).get(`/companies/${companyId}`).expect(200);
    expect(c.body).toMatchObject({ id: companyId, baseCurrency: 'QAR' });
    await api(app, tok.clerk).get(`/companies/${otherCompanyId}`).expect(404);
    await api(app, tok.clerk).get('/companies/not-a-uuid').expect(404);
  });

  it('can skip the authenticator requirement explicitly', async () => {
    const res = await api(app, tok.owner)
      .post(`/companies/${companyId}/users`, staffBody({ requireOtp: false }))
      .expect(201);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: res.body.user.id } });
    expect(idp.users.get(u.oidcSubject)!.requiredActions).toEqual(['UPDATE_PASSWORD']);
  });

  it('a duplicate username is refused and no ERP user is created', async () => {
    const existing = [...idp.users.values()][0]!;
    const before = await prisma.user.count();
    await api(app, tok.owner)
      .post(`/companies/${companyId}/users`, staffBody({ username: existing.username }))
      .expect(409);
    expect(await prisma.user.count()).toBe(before);
  });

  it('if a later step fails, the new sign-in account is removed again (no orphan logins)', async () => {
    const accounts = idp.users.size;
    const erpUsers = await prisma.user.count();
    idp.failNextPassword = true;
    const res = await api(app, tok.owner).post(`/companies/${companyId}/users`, staffBody()).expect(502);
    expect(res.body.detail).toMatch(/temporary password/);
    expect(idp.users.size).toBe(accounts); // created, then deleted again
    expect(idp.deleted.length).toBeGreaterThan(0);
    expect(await prisma.user.count()).toBe(erpUsers);
  });

  it('never deletes a sign-in account that is already linked to someone', async () => {
    const clash = await prisma.user.findUniqueOrThrow({ where: { id: ids.clerk } });
    idp.nextSubject = clash.oidcSubject; // a misbehaving identity provider returns an existing id
    const res = await api(app, tok.owner).post(`/companies/${companyId}/users`, staffBody()).expect(409);
    expect(res.body.detail).toMatch(/already linked/);
    expect(idp.deleted).not.toContain(clash.oidcSubject);
    await api(app, tok.clerk).get('/me').expect(200);
  });

  it('validates input and the role/branch belong to the company', async () => {
    await api(app, tok.owner)
      .post(`/companies/${companyId}/users`, staffBody({ username: 'x' }))
      .expect(400);
    await api(app, tok.owner)
      .post(`/companies/${companyId}/users`, staffBody({ roleId: randomUUID() }))
      .expect(422);
    await api(app, tok.owner)
      .post(`/companies/${companyId}/users`, staffBody({ branchId: randomUUID() }))
      .expect(422);
  });
});

describe('no privilege escalation through onboarding', () => {
  beforeAll(async () => {
    const res = await api(app, tok.owner)
      .post(`/companies/${companyId}/users`, staffBody({ roleId: ids.branchAdminRole, branchId: ids.DOH }))
      .expect(201);
    ids.branchAdmin = res.body.user.id;
    const u = await prisma.user.findUniqueOrThrow({ where: { id: ids.branchAdmin } });
    tok.branchAdmin = await auth.sign(u.oidcSubject);
  });

  it('a branch admin can onboard a viewer for their branch', async () => {
    await api(app, tok.branchAdmin)
      .post(`/companies/${companyId}/users`, staffBody({ roleId: ids.viewerRole, branchId: ids.DOH }))
      .expect(201);
  });

  it('but not with a role they do not fully hold, not company-wide and not for another branch', async () => {
    const accountsBefore = idp.users.size;
    await api(app, tok.branchAdmin)
      .post(`/companies/${companyId}/users`, staffBody({ roleId: ids.clerkRole, branchId: ids.DOH }))
      .expect(403);
    await api(app, tok.branchAdmin)
      .post(`/companies/${companyId}/users`, staffBody({ roleId: ids.viewerRole, branchId: null }))
      .expect(403);
    await api(app, tok.branchAdmin)
      .post(`/companies/${companyId}/users`, staffBody({ roleId: ids.viewerRole, branchId: ids.WAK }))
      .expect(403);
    expect(idp.users.size).toBe(accountsBefore); // refused before any sign-in account was created
  });

  it('staff without iam.user.manage cannot onboard at all, and other companies are invisible', async () => {
    await api(app, tok.clerk).post(`/companies/${companyId}/users`, staffBody()).expect(403);
    await api(app, tok.owner).post(`/companies/${otherCompanyId}/users`, staffBody()).expect(404);
  });

  it('the list is limited to the caller’s branch scope', async () => {
    const all = (await api(app, tok.owner).get(`/companies/${companyId}/users`).expect(200)).body as {
      id: string;
    }[];
    expect(all.map((u) => u.id)).toEqual(expect.arrayContaining([ids.owner, ids.clerk, ids.branchAdmin]));
    const branchView = (await api(app, tok.branchAdmin).get(`/companies/${companyId}/users`).expect(200))
      .body as {
      id: string;
      assignments: { branchId: string | null }[];
    }[];
    expect(branchView.map((u) => u.id)).not.toContain(ids.owner); // company-wide admin is outside a branch view
    expect(branchView.every((u) => u.assignments.every((a) => a.branchId === ids.DOH))).toBe(true);
  });
});

describe('password reset and deactivation', () => {
  it('reset issues a new temporary password and ends the user’s sessions', async () => {
    const u = await prisma.user.findUniqueOrThrow({ where: { id: ids.clerk } });
    const before = idp.users.get(u.oidcSubject)!.sessionsEnded;
    const res = await api(app, tok.owner)
      .post(`/companies/${companyId}/users/${ids.clerk}/reset-password`)
      .expect(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(idp.users.get(u.oidcSubject)!.password).toBe(res.body.temporaryPassword);
    expect(idp.users.get(u.oidcSubject)!.sessionsEnded).toBe(before + 1);
  });

  it('refuses self-service, platform administrators and people beyond the caller’s authority', async () => {
    await api(app, tok.owner).post(`/companies/${companyId}/users/${ids.owner}/reset-password`).expect(422);
    // The platform admin also holds a role in this company (assigned by the owner) but is protected.
    await api(app, tok.owner)
      .post(`/companies/${companyId}/role-assignments`, { userId: ids.platform, roleId: ids.viewerRole })
      .expect(201);
    await api(app, tok.owner)
      .post(`/companies/${companyId}/users/${ids.platform}/reset-password`)
      .expect(403);
    // Branch admin cannot reset the clerk (clerk holds journal.post, which the branch admin lacks).
    await api(app, tok.branchAdmin)
      .post(`/companies/${companyId}/users/${ids.clerk}/reset-password`)
      .expect(403);
  });

  it('refuses people who also work for another company (platform administrator territory)', async () => {
    const shared = await api(app, tok.owner)
      .post(`/companies/${companyId}/users`, staffBody({ roleId: ids.viewerRole }))
      .expect(201);
    const otherViewer = (
      await api(app, tok.platform)
        .post(`/companies/${otherCompanyId}/roles`, {
          code: 'viewer',
          name: 'Viewer',
          permissions: ['accounting.journal.read'],
        })
        .expect(201)
    ).body.id;
    await api(app, tok.platform)
      .post(`/companies/${otherCompanyId}/role-assignments`, {
        userId: shared.body.user.id,
        roleId: otherViewer,
      })
      .expect(201);
    await api(app, tok.owner)
      .post(`/companies/${companyId}/users/${shared.body.user.id}/reset-password`)
      .expect(403);
    await api(app, tok.platform)
      .post(`/companies/${otherCompanyId}/users/${shared.body.user.id}/reset-password`)
      .expect(200);
  });

  it('deactivation blocks the ERP immediately, disables sign-in and ends sessions; reactivation restores it', async () => {
    const u = await prisma.user.findUniqueOrThrow({ where: { id: ids.clerk } });
    await api(app, tok.clerk).get('/me').expect(200);
    const res = await api(app, tok.owner)
      .post(`/companies/${companyId}/users/${ids.clerk}/status`, {
        status: 'inactive',
        reason: 'Left the company',
      })
      .expect(200);
    expect(res.body.status).toBe('inactive');
    expect(idp.users.get(u.oidcSubject)!.enabled).toBe(false);
    await api(app, tok.clerk).get('/me').expect(403); // an existing token no longer works
    await api(app, tok.owner)
      .post(`/companies/${companyId}/users/${ids.clerk}/status`, { status: 'inactive', reason: 'again' })
      .expect(409);
    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { entityId: ids.clerk, action: 'iam.user.deactivate' },
    });
    expect(audit.reason).toBe('Left the company');
    await api(app, tok.owner)
      .post(`/companies/${companyId}/users/${ids.clerk}/status`, { status: 'active', reason: 'Returned' })
      .expect(200);
    expect(idp.users.get(u.oidcSubject)!.enabled).toBe(true);
    await api(app, tok.clerk).get('/me').expect(200);
  });
});

describe('roles and the permission matrix', () => {
  it('lists roles with member counts', async () => {
    const roles = (await api(app, tok.owner).get(`/companies/${companyId}/roles`).expect(200)).body as {
      code: string;
      memberCount: number;
    }[];
    expect(roles.find((r) => r.code === 'company-admin')?.memberCount).toBe(1);
    expect(roles.find((r) => r.code === 'clerk')?.memberCount).toBeGreaterThanOrEqual(1);
  });

  it('editing a role changes its holders’ permissions on their next request, with optimistic locking', async () => {
    await api(app, tok.clerk).get(`/companies/${companyId}/audit-events`).expect(403);
    const role = (await api(app, tok.owner).get(`/companies/${companyId}/roles`).expect(200)).body.find(
      (r: { code: string }) => r.code === 'clerk',
    );
    const updated = await api(app, tok.owner)
      .patch(`/companies/${companyId}/roles/${role.id}`, {
        name: 'Clerk',
        nameAr: 'كاتب',
        permissions: [...role.permissions, 'audit.read'],
        version: role.version,
      })
      .expect(200);
    expect(updated.body.version).toBe(role.version + 1);
    await api(app, tok.clerk).get(`/companies/${companyId}/audit-events`).expect(200);
    await api(app, tok.owner)
      .patch(`/companies/${companyId}/roles/${role.id}`, {
        name: 'Clerk',
        permissions: role.permissions,
        version: role.version,
      })
      .expect(409);
  });

  it('system roles are fixed; unknown permissions are refused', async () => {
    const admin = (await api(app, tok.owner).get(`/companies/${companyId}/roles`).expect(200)).body.find(
      (r: { code: string }) => r.code === 'company-admin',
    );
    await api(app, tok.owner)
      .patch(`/companies/${companyId}/roles/${admin.id}`, {
        name: 'x',
        permissions: ['audit.read'],
        version: admin.version,
      })
      .expect(403);
    await api(app, tok.owner).delete(`/companies/${companyId}/roles/${admin.id}`).expect(403);
    const viewer = (await api(app, tok.owner).get(`/companies/${companyId}/roles`).expect(200)).body.find(
      (r: { code: string }) => r.code === 'viewer',
    );
    await api(app, tok.owner)
      .patch(`/companies/${companyId}/roles/${viewer.id}`, {
        name: 'Viewer',
        permissions: ['everything'],
        version: viewer.version,
      })
      .expect(422);
  });

  it('roles in use cannot be deleted; unused ones can', async () => {
    await api(app, tok.owner).delete(`/companies/${companyId}/roles/${ids.viewerRole}`).expect(409);
    const temp = (
      await api(app, tok.owner)
        .post(`/companies/${companyId}/roles`, { code: 'temp', name: 'Temp', permissions: ['audit.read'] })
        .expect(201)
    ).body.id;
    await api(app, tok.owner).delete(`/companies/${companyId}/roles/${temp}`).expect(204);
    await api(app, tok.owner).delete(`/companies/${companyId}/roles/${temp}`).expect(404);
  });

  it('administrators cannot remove their own role assignment (no self lock-out)', async () => {
    const own = (await api(app, tok.owner).get(`/companies/${companyId}/users/${ids.owner}`).expect(200)).body
      .assignments[0];
    const res = await api(app, tok.owner)
      .delete(`/companies/${companyId}/role-assignments/${own.assignmentId}`)
      .expect(422);
    expect(res.body.detail).toMatch(/own role assignment/);
  });

  it('existing company-administrator roles received iam.user.manage', async () => {
    const roles = await prisma.role.findMany({ where: { code: 'company-admin', isSystem: true } });
    expect(roles.every((r) => r.permissions.includes('iam.user.manage'))).toBe(true);
  });
});

describe('without an identity server configured', () => {
  it('onboarding answers 503 instead of pretending to succeed', async () => {
    const env = loadApiEnv({
      ...process.env,
      LOG_LEVEL: 'error',
      OIDC_ISSUER: ISSUER,
      OIDC_AUDIENCE: AUDIENCE,
      OIDC_JWKS_URL: `${ISSUER}/protocol/openid-connect/certs`,
    });
    const { auth: a2, jwks } = await createTestAuth();
    const bare = await createApp(
      { ...env, KEYCLOAK_ADMIN_BASE_URL: undefined, KEYCLOAK_ADMIN_CLIENT_SECRET: undefined },
      { bufferLogs: false, keyResolver: jwks },
    );
    await bare.init();
    try {
      const owner = await prisma.user.findUniqueOrThrow({ where: { id: ids.owner } });
      const res = await api(bare, await a2.sign(owner.oidcSubject))
        .post(`/companies/${companyId}/users`, staffBody({ roleId: ids.viewerRole }))
        .expect(503);
      expect(res.body.detail).toMatch(/not configured/);
    } finally {
      await bare.close();
    }
  });
});
