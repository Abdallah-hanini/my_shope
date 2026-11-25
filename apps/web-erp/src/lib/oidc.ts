import 'server-only';
import * as oidc from 'openid-client';
import type { SignInConfig } from './config';

/**
 * openid-client configuration built explicitly (no discovery): browser-facing endpoints use the
 * public issuer URL; token and key requests go over the private network to Keycloak. Tokens are
 * still validated against the public issuer.
 */
export function oidcConfiguration(c: SignInConfig): oidc.Configuration {
  const frontend = c.issuer.replace(/\/$/, '');
  const backend = c.internalBaseUrl;
  const metadata: oidc.ServerMetadata = {
    issuer: frontend,
    authorization_endpoint: `${frontend}/protocol/openid-connect/auth`,
    end_session_endpoint: `${frontend}/protocol/openid-connect/logout`,
    token_endpoint: `${backend}/protocol/openid-connect/token`,
    jwks_uri: `${backend}/protocol/openid-connect/certs`,
    id_token_signing_alg_values_supported: ['RS256'],
    code_challenge_methods_supported: ['S256'],
  };
  const config = new oidc.Configuration(metadata, c.clientId, c.clientSecret);
  if (backend.startsWith('http://')) {
    // Private Docker network or localhost development only (validated by webEnvSchema).
    oidc.allowInsecureRequests(config);
  }
  return config;
}

export { oidc };
