# Phase 0 task plan — Foundation

Gate (docs/ROADMAP.md): builds and smoke tests pass. Phase 1 does not start until the gate passes **and the owner approves**.

| ID | Task | Depends on | Requirements | Acceptance test | Status |
|---|---|---|---|---|---|
| P0-01 | pnpm + Turborepo workspace, pinned versions, lockfile, shared TS/ESLint/Jest presets | — | ARCH-01, ARCH-12 | `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm lint` | Done |
| P0-02 | Docker Compose: PostgreSQL 16, cache Redis (evictable), queue Redis (noeviction + AOF) | — | ARCH-08 | `docker compose up -d --wait` reports 3 healthy services | Done |
| P0-03 | `packages/validation`: fail-fast env schemas that never echo values | P0-01 | SEC-01 | `validation` unit tests (7) | Done |
| P0-04 | NestJS API: `/api/v1`, URI versioning, RFC 9457 filter, helmet, CORS allow-list, request ids, pino with redaction | P0-03 | ARCH-03, SEC-02 | `api` unit tests; integration 404/headers tests | Done |
| P0-05 | Health endpoints: live (process) and ready (PostgreSQL, cache, queue, each with timeout) returning 503 + per-dependency report | P0-04 | ARCH-11 | integration: all up → 200; cache down → 503 with `cache: down` | Done |
| P0-06 | Prisma + reviewed foundation migration (pgcrypto, pg_trgm, domain schemas); drift check | P0-02 | ARCH-09 | `db:migrate` twice (idempotent), `db:migrate:check` "No difference", integration schema test | Done |
| P0-07 | OpenAPI generation → `@erp/contracts` types → `@erp/api-client` | P0-05 | ARCH-06 | `pnpm contracts:check`; api-client unit tests (4) | Done |
| P0-08 | Worker: BullMQ heartbeat scheduler, loud failure of unknown jobs, health server, graceful shutdown | P0-02, P0-03 | ARCH-05 | worker unit (5) + integration (2) tests; smoke readiness | Done |
| P0-09 | Localization (en/ar, RTL), design tokens (WCAG contrast, 44pt targets), web-ui, mobile-ui | P0-01 | ADM-006, UX-01 | localization (11), tokens (5), web-ui (1) tests | Done |
| P0-10 | Next.js web shell: locale routing + Accept-Language negotiation, RTL, live status page, `/healthz`, security headers | P0-07, P0-09 | ARCH-02, ADM-006, UX-02 | web unit tests (8); smoke: en/ar × desktop/phone in Chromium | Done |
| P0-11 | Expo customer app shell (own bundle id/scheme), health card, locale toggle | P0-07, P0-09 | ARCH-04, ADM-006 | jest-expo tests (3); `expo export` android+ios; `expo install --check` | Done (no device run) |
| P0-12 | Expo manager app shell (separate bundle id/scheme/pipeline) | P0-11 | ARCH-04 | jest-expo tests (3); `expo export` android+ios; `expo install --check` | Done (no device run) |
| P0-13 | CI workflow mirroring the local gate | all | ARCH-10 | Runs on GitHub | Written, **not executed** (see STATUS blockers) |
| P0-14 | Smoke test script (API + worker + web, real services, real browser) | P0-05, P0-08, P0-10 | ROADMAP gate | `pnpm test:smoke` 10/10 | Done |
| P0-15 | Task plan, traceability matrix, decision log, STATUS | — | CLAUDE.md | Docs reviewed by owner | Done (awaiting review) |

## Out of scope for Phase 0 (deliberately)

Authentication/OIDC, RBAC, tenancy tables, audit, outbox table, any business entity. Those are Phase 1 and depend on decisions in `docs/DECISIONS.md`.
