import 'server-only';
import { parseEnv, webEnvSchema, type WebEnv } from '@erp/validation';

let cached: WebEnv | undefined;

/** Validated web server settings; throws at first use if they are inconsistent. */
export function webConfig(): WebEnv {
  cached ??= parseEnv(webEnvSchema, process.env);
  return cached;
}

export interface SignInConfig {
  publicUrl: string;
  issuer: string;
  internalBaseUrl: string;
  clientId: string;
  clientSecret: string;
  sessionSecret: string;
}

/** null when sign-in is not configured (development without Keycloak). */
export function signInConfig(): SignInConfig | null {
  const c = webConfig();
  if (!c.WEB_PUBLIC_URL || !c.OIDC_ISSUER || !c.OIDC_CLIENT_SECRET || !c.WEB_SESSION_SECRET) return null;
  return {
    publicUrl: c.WEB_PUBLIC_URL,
    issuer: c.OIDC_ISSUER,
    internalBaseUrl: (c.OIDC_INTERNAL_BASE_URL ?? c.OIDC_ISSUER).replace(/\/$/, ''),
    clientId: c.OIDC_CLIENT_ID,
    clientSecret: c.OIDC_CLIENT_SECRET,
    sessionSecret: c.WEB_SESSION_SECRET,
  };
}
