import type { HealthReport, LivenessReport, paths, ProblemDetails } from '@erp/contracts';
import createClient, { type Middleware } from 'openapi-fetch';

export type {
  Account,
  AuditEvent,
  Branch,
  Company,
  FinancialSummary,
  FiscalPeriod,
  GeneralLedger,
  HealthReport,
  Journal,
  LivenessReport,
  Me,
  ProblemDetails,
  Role,
  RoleAssignment,
  StaffCreated,
  StaffMember,
  TrialBalance,
} from '@erp/contracts';

/** Thrown for any non-2xx response. Carries the RFC 9457 body when the server sent one. */
export class ApiProblemError extends Error {
  constructor(
    public readonly status: number,
    public readonly problem: Partial<ProblemDetails> | undefined,
  ) {
    super(problem?.title ?? `Request failed with status ${status}`);
    this.name = 'ApiProblemError';
  }
}

export interface ApiClientOptions {
  /** Origin of the API, e.g. http://localhost:4000. The /api/v1 prefix is part of each path. */
  baseUrl: string;
  /** Supplies a bearer token per request. Tokens are never persisted by this package. */
  getAccessToken?: () => Promise<string | undefined> | string | undefined;
  fetch?: typeof globalThis.fetch;
  /** Preferred response language for server messages. */
  locale?: string;
}

export function createApiClient(options: ApiClientOptions) {
  const client = createClient<paths>({
    baseUrl: options.baseUrl.replace(/\/$/, ''),
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });

  const auth: Middleware = {
    async onRequest({ request }) {
      const token = await options.getAccessToken?.();
      if (token) request.headers.set('Authorization', `Bearer ${token}`);
      if (options.locale) request.headers.set('Accept-Language', options.locale);
      return request;
    },
  };
  client.use(auth);

  return {
    raw: client,
    /** Liveness: the API process is up. Does not touch dependencies. */
    async live(): Promise<LivenessReport> {
      const { data, error, response } = await client.GET('/api/v1/health/live');
      if (!data) throw new ApiProblemError(response.status, asProblem(error));
      return data;
    },
    /**
     * Readiness: database, cache and queue checks. A 503 still returns a full report, so callers
     * can show which dependency is down instead of a generic failure.
     */
    async ready(): Promise<HealthReport> {
      const { data, error, response } = await client.GET('/api/v1/health/ready');
      if (data) return data;
      if (response.status === 503 && isHealthReport(error)) return error;
      throw new ApiProblemError(response.status, asProblem(error));
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

/**
 * Returns the body of a successful openapi-fetch result, or throws ApiProblemError carrying the
 * RFC 9457 problem the server sent. For 204 responses use {@link expectOk}.
 */
export function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (result.response.ok && result.data !== undefined) return result.data;
  throw new ApiProblemError(result.response.status, asProblem(result.error));
}

/** Throws ApiProblemError unless the response status is 2xx. */
export function expectOk(result: { error?: unknown; response: Response }): void {
  if (!result.response.ok) throw new ApiProblemError(result.response.status, asProblem(result.error));
}

function asProblem(v: unknown): Partial<ProblemDetails> | undefined {
  return typeof v === 'object' && v !== null ? (v as Partial<ProblemDetails>) : undefined;
}

function isHealthReport(v: unknown): v is HealthReport {
  return typeof v === 'object' && v !== null && 'checks' in v && 'status' in v;
}
