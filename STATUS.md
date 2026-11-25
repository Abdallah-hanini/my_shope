# Delivery status

## Summary

| Phase | Status |
|---|---|
| 0 Foundation | **Implemented and verified locally. Awaiting owner approval of the gate.** CI workflow written but not yet run on GitHub. |
| 1–7 | Not started. Phase 1 must not begin until the owner approves Phase 0 and answers the Phase 1 decisions in [docs/DECISIONS.md](docs/DECISIONS.md) (D-01 to D-04 at minimum). |

## 2026-11-25: Phase 0 foundation

**Requirement IDs:** ARCH-01 to ARCH-12, SEC-01, SEC-02, UX-01, UX-02, ADM-006 (partial). See [docs/TRACEABILITY.md](docs/TRACEABILITY.md) and the task plan in [docs/PHASE0_PLAN.md](docs/PHASE0_PLAN.md).

### Changes

- pnpm 10 + Turborepo 2 monorepo in `erp/` with pinned versions (`save-exact`) and a committed lockfile.
- `apps/api`: NestJS 11 on Express. `/api/v1` URI versioning, RFC 9457 errors (no internals leaked), helmet, CORS allow-list, request ids, pino logs with auth/cookie redaction, env validated at startup. Liveness and readiness health checks (PostgreSQL, cache Redis, queue Redis, each with a 1.5 s timeout; 503 with a per-dependency report). OpenAPI generation.
- `apps/api/prisma`: Prisma 6.19. Reviewed foundation migration adds pgcrypto, pg_trgm and 11 empty domain schemas. No tables yet.
- `apps/worker`: BullMQ 5. Heartbeat job scheduler; unknown jobs fail loudly; health server on :4100; graceful shutdown.
- `apps/web-erp`: Next.js 15.5, Tailwind 4. `[locale]` routing (en/ar) with `lang` and `dir`, Accept-Language redirect, live system-status page (server-rendered, `no-store`), `/healthz`, security headers.
- `apps/customer-mobile` and `apps/manager-mobile`: Expo SDK 54 / React Native 0.81, expo-router. Separate names, slugs, schemes and bundle ids. React Query health card, Arabic/English toggle with RTL layout, RTL enabled in the localization plugin.
- Shared packages: contracts, api-client, validation, localization, design-tokens, web-ui, mobile-ui, config.
- `docker-compose.yml`: PostgreSQL 16, an evictable cache Redis (allkeys-lru) and a separate queue Redis (noeviction + AOF), all bound to 127.0.0.1.
- `.github/workflows/erp-ci.yml` (repository root): format, build, typecheck, lint, unit tests, contract drift, migrations and drift, integration tests, smoke test.
- Docs: master spec split into `CLAUDE.md` and `docs/*`, plus PHASE0_PLAN, TRACEABILITY, DECISIONS and this file.

### Commands run and results (2026-11-25, this container: Linux, Node 22.23.5, pnpm 10.28.0, Docker 29.9.3)

| Command | Result |
|---|---|
| `pnpm install --frozen-lockfile` | ✅ exit 0 |
| `pnpm format:check` | ✅ all files formatted |
| `pnpm turbo run build --force` | ✅ 12/12 tasks. Includes `next build` and `expo export` for android + ios, about 2.7 MB JS bundle per platform per app |
| `pnpm turbo run typecheck --force` | ✅ 20/20 tasks |
| `pnpm turbo run lint --force` | ✅ 20/20 tasks, 0 warnings |
| `pnpm turbo run test --force` | ✅ 56 tests in 11 suites: validation 7, localization 11, design-tokens 5, api-client 4, web-ui 1, api 9, worker 5, web-erp 8, customer-mobile 3, manager-mobile 3 |
| `docker compose up -d --wait` | ✅ postgres, redis-cache, redis-queue healthy |
| `pnpm db:migrate` on a fresh database, run twice | ✅ applied, then "No pending migrations" |
| `pnpm db:migrate:check` | ✅ "No difference detected" |
| `pnpm --filter @erp/api test:integration` | ✅ 6/6: live, ready with all dependencies up, schemas and extensions present, 404 as problem+json, security headers, 503 when cache is down |
| `pnpm --filter @erp/worker test:integration` | ✅ 2/2: heartbeat processed, unknown job fails |
| `pnpm test:smoke` | ✅ 10/10: API live/ready, docs off in production, worker ready with heartbeat, web `/healthz`, locale redirect, `/en` and `/ar` at 1280 px and 390 px in Chromium (correct `dir`/`lang`, live status, no horizontal scroll, no page errors) |
| `expo install --check` (both apps) | ✅ "Dependencies are up to date". The check ran offline against Expo's bundled SDK 54 map, so treat it as indicative |
| `pnpm contracts:check` (after commit) | ✅ exit 0 when current. Negative check: editing a DTO description made it exit 1 (drift detected), and it returned to exit 0 after reverting |
| Parent repo `npm test` (profile site) | ✅ 11/11. The existing site is unaffected |

### Not tested / not done

- **CI on GitHub has not run.** The parent README says GitHub Actions is blocked on this account by a billing issue. Every step was run locally instead, as listed above.
- **No mobile device or simulator run.** No iOS simulator or Android emulator is available here. Verified so far: TypeScript, Jest (jest-expo), and production JS bundles via `expo export`. Native builds (EAS or prebuild), Maestro flows and real-device RTL rendering are still to do.
- Native RTL: the apps flip layout with the `direction` style and enable `supportsRTL`. A full native `I18nManager.forceRTL` plus reload on language switch is not implemented yet.
- `prisma migrate diff` only compares the `public` schema. Domain schemas are created by reviewed SQL and checked by the integration test, not by the drift check.
- Not started yet: authentication, RBAC/scopes, tenancy tables, audit, outbox. These are Phase 1.
- No load, security or accessibility scanner runs yet (k6, ZAP, axe). These are Phase 7 targets. Contrast and touch targets are unit-tested.

### Blockers

- None for Phase 0.
- For Phase 1: D-01 (jurisdiction/residency), D-02 (legal entity structure), D-03 (OIDC provider), D-04 (chart of accounts and posting sign-off). See [docs/DECISIONS.md](docs/DECISIONS.md).

### Assumptions

- The ERP lives in `erp/` inside the existing `my-profile-` repository because that is the only repository available. It does not depend on its parent, so it can move as-is.
- Bundle ids `com.example.erp.customer` and `com.example.erp.manager` and the app names are placeholders (D-12).
- All data and credentials are synthetic local-development values.

### Next task (after approval)

Phase 1 kickoff:
1. Produce the detailed ERD and migration review for identity, organization and accounting (docs/DATA.md).
2. Then build the first vertical slice: company, branch and user scope with server-side enforcement, plus cross-tenant isolation tests.
3. Then the audit and outbox tables.
4. Then the chart of accounts, fiscal periods and balanced, immutable journal posting with reversal, plus the tests named in the Phase 1 gate.
