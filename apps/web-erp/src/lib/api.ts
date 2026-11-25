import 'server-only';
import { ApiProblemError, createApiClient } from '@erp/api-client';
import { webConfig } from './config';

/** Typed API client for one request, authenticated with the session's access token (server side only). */
export function apiFor(accessToken: string) {
  return createApiClient({
    baseUrl: webConfig().API_INTERNAL_URL,
    getAccessToken: () => accessToken,
    fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
  }).raw;
}
export type Api = ReturnType<typeof apiFor>;

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; title?: string; detail?: string };

/** Runs an API call and turns RFC 9457 problems into a value the page can render. */
export async function attempt<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    if (err instanceof ApiProblemError) {
      return { ok: false, status: err.status, title: err.problem?.title, detail: err.problem?.detail };
    }
    console.error('API call failed:', err instanceof Error ? err.message : err);
    return { ok: false, status: 0 };
  }
}
