import { HttpStatus } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { ApiEnv } from '../config/env';
import { DomainError } from '../common/errors';

export const IDENTITY_PROVISIONER = Symbol('IDENTITY_PROVISIONER');

export interface NewIdentity {
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  locale: 'en' | 'ar';
  requiredActions: ('UPDATE_PASSWORD' | 'CONFIGURE_TOTP')[];
}

/**
 * Sign-in accounts live in the identity provider (Keycloak); the ERP stores only the link
 * (issuer + subject). Implementations must never log passwords.
 */
export interface IdentityProvisioner {
  readonly issuer: string;
  createUser(identity: NewIdentity): Promise<string>;
  setTemporaryPassword(subject: string, password: string): Promise<void>;
  setEnabled(subject: string, enabled: boolean): Promise<void>;
  logoutSessions(subject: string): Promise<void>;
  deleteUser(subject: string): Promise<void>;
}

export class ProvisioningConflict extends DomainError {
  constructor() {
    super(HttpStatus.CONFLICT, 'A sign-in account with this username or email already exists');
  }
}

export class ProvisioningUnavailable extends DomainError {
  constructor(detail = 'Staff sign-in accounts cannot be managed: the identity server is not configured') {
    super(HttpStatus.SERVICE_UNAVAILABLE, detail);
  }
}

/** 16 random URL-safe characters (96 bits); satisfies the realm policy (length ≥ 12). */
export function generateTemporaryPassword(): string {
  return randomBytes(12).toString('base64url');
}

/**
 * Keycloak Admin REST API client using the realm's `erp-api-admin` service account, which holds
 * only realm-management user roles (manage-users, view-users, query-users).
 */
export class KeycloakProvisioner implements IdentityProvisioner {
  private token: { value: string; expiresAt: number } | undefined;

  constructor(
    private readonly baseUrl: string,
    private readonly realm: string,
    private readonly clientId: string,
    private readonly clientSecret: string,
    readonly issuer: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async accessToken(force = false): Promise<string> {
    if (!force && this.token && this.token.expiresAt > Date.now() + 30_000) return this.token.value;
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}/realms/${this.realm}/protocol/openid-connect/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: this.clientId,
          client_secret: this.clientSecret,
        }),
      });
    } catch {
      throw new ProvisioningUnavailable('The identity server could not be reached');
    }
    if (!res.ok)
      throw new ProvisioningUnavailable(
        `The identity server refused the service account (HTTP ${res.status})`,
      );
    const body = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
    return body.access_token;
  }

  private async call(method: string, path: string, body?: unknown, retry = true): Promise<Response> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}/admin/realms/${this.realm}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${await this.accessToken(!retry)}`,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ProvisioningUnavailable('The identity server could not be reached');
    }
    if (res.status === 401 && retry) return this.call(method, path, body, false);
    return res;
  }

  private async expectOk(res: Response, action: string): Promise<void> {
    if (res.ok) return;
    // The response body is not echoed: it may contain the submitted values.
    throw new DomainError(
      HttpStatus.BAD_GATEWAY,
      `The identity server could not ${action} (HTTP ${res.status})`,
    );
  }

  async createUser(i: NewIdentity): Promise<string> {
    const res = await this.call('POST', '/users', {
      username: i.username,
      email: i.email,
      firstName: i.firstName,
      lastName: i.lastName,
      enabled: true,
      emailVerified: true,
      requiredActions: i.requiredActions,
      attributes: { locale: [i.locale] },
    });
    if (res.status === 409) throw new ProvisioningConflict();
    await this.expectOk(res, 'create the sign-in account');
    const id = res.headers.get('location')?.split('/').pop();
    if (!id)
      throw new DomainError(HttpStatus.BAD_GATEWAY, 'The identity server did not return the new account id');
    return id;
  }

  async setTemporaryPassword(subject: string, password: string): Promise<void> {
    const res = await this.call('PUT', `/users/${encodeURIComponent(subject)}/reset-password`, {
      type: 'password',
      value: password,
      temporary: true,
    });
    await this.expectOk(res, 'set the temporary password');
  }

  async setEnabled(subject: string, enabled: boolean): Promise<void> {
    const res = await this.call('PUT', `/users/${encodeURIComponent(subject)}`, { enabled });
    await this.expectOk(res, enabled ? 'enable the account' : 'disable the account');
  }

  async logoutSessions(subject: string): Promise<void> {
    const res = await this.call('POST', `/users/${encodeURIComponent(subject)}/logout`);
    await this.expectOk(res, 'end the sessions');
  }

  async deleteUser(subject: string): Promise<void> {
    const res = await this.call('DELETE', `/users/${encodeURIComponent(subject)}`);
    if (res.status === 404) return;
    await this.expectOk(res, 'delete the account');
  }
}

/** Used when Keycloak admin access is not configured: every call answers 503, never fakes success. */
export class UnconfiguredProvisioner implements IdentityProvisioner {
  readonly issuer = '';
  async createUser(): Promise<string> {
    throw new ProvisioningUnavailable();
  }
  async setTemporaryPassword(): Promise<void> {
    throw new ProvisioningUnavailable();
  }
  async setEnabled(): Promise<void> {
    throw new ProvisioningUnavailable();
  }
  async logoutSessions(): Promise<void> {
    throw new ProvisioningUnavailable();
  }
  async deleteUser(): Promise<void> {
    throw new ProvisioningUnavailable();
  }
}

export function createProvisioner(env: ApiEnv): IdentityProvisioner {
  if (!env.KEYCLOAK_ADMIN_BASE_URL || !env.KEYCLOAK_ADMIN_CLIENT_SECRET || !env.OIDC_ISSUER) {
    return new UnconfiguredProvisioner();
  }
  return new KeycloakProvisioner(
    env.KEYCLOAK_ADMIN_BASE_URL.replace(/\/$/, ''),
    env.KEYCLOAK_REALM,
    env.KEYCLOAK_ADMIN_CLIENT_ID,
    env.KEYCLOAK_ADMIN_CLIENT_SECRET,
    env.OIDC_ISSUER,
  );
}
