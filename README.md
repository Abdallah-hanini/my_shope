# Automotive ERP

Workshop, parts retail/wholesale, inventory, accounting, HR and CRM for automotive businesses, with three mandatory clients: a Next.js web ERP, a customer mobile app and a separate manager mobile app.

**Status: Phase 0 (foundation) only.** No business module is implemented yet. See [STATUS.md](STATUS.md).

Read in this order: [CLAUDE.md](CLAUDE.md) (engineering charter) → [docs/BRD.md](docs/BRD.md) → [SRS](docs/SRS.md) → [ARCHITECTURE](docs/ARCHITECTURE.md) → [DATA](docs/DATA.md) → [ACCOUNTING](docs/ACCOUNTING.md) → [REPORTING](docs/REPORTING.md) → [MOBILE](docs/MOBILE.md) → [SECURITY_QA](docs/SECURITY_QA.md) → [ROADMAP](docs/ROADMAP.md).
Planning: [Phase 0 plan](docs/PHASE0_PLAN.md) · [Traceability matrix](docs/TRACEABILITY.md) · [Decisions and open questions](docs/DECISIONS.md) · [Original master specification](docs/spec/MASTER_SPECIFICATION.md).

## Layout

```
apps/
  api/              NestJS REST API (/api/v1, OpenAPI, RFC 9457 errors, Prisma)
  worker/           BullMQ background worker
  web-erp/          Next.js ERP web client (en/ar, RTL)
  customer-mobile/  Expo app for customers   (com.example.erp.customer — placeholder id)
  manager-mobile/   Expo app for managers    (com.example.erp.manager  — placeholder id)
packages/
  contracts/        openapi.json generated from the API + derived TypeScript types
  api-client/       typed client (openapi-fetch) used by all three clients
  validation/       Zod schemas (environment today; shared input rules later)
  localization/     en/ar catalogs, RTL direction, locale helpers
  design-tokens/    colors (WCAG-checked), spacing, type, touch targets
  web-ui/           React components for the web
  mobile-ui/        React Native components for both apps (UI only, no shared permissions)
  config/           shared ESLint / TypeScript / Jest presets
scripts/smoke.mjs   end-to-end smoke test (API + worker + web in Chromium)
docker-compose.yml  local PostgreSQL 16, cache Redis, queue Redis
```

## Prerequisites

Node 22 (`.nvmrc`), pnpm 10.28 (`corepack enable`), Docker with Compose.

## Run locally

```bash
cd erp
pnpm install
cp .env.example .env && cp apps/api/.env.example apps/api/.env
cp apps/worker/.env.example apps/worker/.env && cp apps/web-erp/.env.example apps/web-erp/.env.local
pnpm db:up                      # PostgreSQL :5432, cache Redis :6379, queue Redis :6380
pnpm db:migrate                 # apply Prisma migrations
pnpm build
pnpm dev                        # api :4000, worker health :4100, web :3000, Expo dev servers
```

- API docs (non-production only): http://localhost:4000/api/docs
- Health: `GET /api/v1/health/live`, `GET /api/v1/health/ready` (503 with a per-dependency report if anything is down)
- Web: http://localhost:3000 (redirects to `/en` or `/ar` by `Accept-Language`)
- Mobile: `pnpm --filter @erp/customer-mobile dev` (or `manager-mobile`), then open in Expo Go / a simulator. On a physical device set `EXPO_PUBLIC_API_URL` to your machine's LAN address and add that origin to `API_CORS_ORIGINS`.

## Quality gate

```bash
pnpm format:check && pnpm build && pnpm typecheck && pnpm lint && pnpm test
pnpm contracts:check                                   # OpenAPI + generated types are committed and current
createdb erp_shadow (or psql -c "CREATE DATABASE erp_shadow")
pnpm db:migrate && pnpm db:migrate:check               # migrations apply and match schema.prisma
pnpm --filter @erp/api test:integration                # real PostgreSQL + Redis
pnpm --filter @erp/worker test:integration             # real Redis
pnpm test:smoke                                        # boots built apps, checks health, renders en/ar in Chromium
```

Integration and smoke tests need the Docker services and fail (they never skip) when those are missing.
CI runs the same steps: `.github/workflows/erp-ci.yml` at the repository root.

## Changing the API contract

Edit DTOs/controllers in `apps/api`, then `pnpm contracts:generate` and commit `packages/contracts/openapi.json` and `src/generated.ts`. Clients only call the API through `@erp/api-client`.

## Adding a migration

`pnpm --filter @erp/api prisma:migrate:dev --name <change> --create-only`, review and hand-edit the SQL (constraints, indexes, locking), then apply. Never edit an applied migration.
