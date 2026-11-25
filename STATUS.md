# Delivery status

## Summary

| Phase | Status |
|---|---|
| 0 Foundation | **Approved by the owner on 2026-11-25.** |
| 1 Identity/org/accounting | **In progress.** The API slice (P1-01 to P1-09) is implemented and verified locally. Still to do: client screens (P1-10), outbox relay (P1-11), maker-checker (P1-12, needs D-11) and opening balances (P1-13, needs D-14). Gate not yet claimed. |
| Shop server (L-01 to L-05) | **Implemented and verified on Linux Docker.** Not yet installed on the real Windows PC. |
| 2–7 | Not started. |

## 2026-11-25: Shop server for the Windows PC (Keycloak, HTTPS, backups)

**Owner decision:** Keycloak approved for staff sign-in (D-03).
**Items:** L-01 to L-05 (docs/DECISIONS.md), SEC-04 (provider side). Guide: [docs/DEPLOY_WINDOWS.md](docs/DEPLOY_WINDOWS.md).

### Changes

- `deploy/docker-compose.prod.yml`: PostgreSQL 16, cache and queue Redis, Keycloak 26.4.7 (its own DB and role), a one-shot migration job, API, worker, web, Caddy and a backup service.
  - Only Caddy publishes a port (443). Restart policy is `unless-stopped`, every service has a health check, and logs are size-limited.
- `deploy/Dockerfile`: one image for API, worker, web and migrations. An optional BuildKit secret lets it build behind a TLS-inspecting proxy; the certificate is never stored in the image.
- `deploy/keycloak/realm-erp.json`: the realm definition, used by dev and prod.
  - Clients: `erp-web` (confidential) and `erp-manager-mobile` (public). Both use authorization code + PKCE S256, have direct password grants disabled, and carry an `erp-api` audience mapper.
  - Brute-force lockout, 12-character password policy, 5-minute access tokens, login event logging.
  - The public URL and client secret are injected from the environment.
- `deploy/caddy/Caddyfile`: HTTPS with Caddy's local CA, HSTS. Routes `/api/*` to the API, `/auth/*` to Keycloak, and everything else to web.
- `deploy/backup/backup.sh`:
  - Scheduled `pg_dump` of both databases, each checked with `pg_restore --list`, with a SHA-256 file.
  - Retention: 30 days, but at least 14 dumps kept per database.
  - `LAST_SUCCESS` / `LAST_FAILURE` markers drive the health check.
  - `verify` restores the newest dump into a scratch database and checks that the ledger balances per company.
  - `restore.sh` replaces a live database after a checksum check.
- `deploy/scripts/bootstrap-admin.sh`: creates a Keycloak user with a one-time temporary password and forced password change plus authenticator enrolment.
- `deploy/windows/*.ps1` and the `ErpShop.psm1` module: install, add-admin, export-ca, status, start, stop, backup-now, verify-backup, restore (typed confirmation and a safety backup first), upgrade (backs up first).
- `deploy/scripts/verify-deployment.mjs` (`pnpm deploy:verify`): an end-to-end check of a running server, also added to CI as job `deploy-verify`.
- Dev: Keycloak added to `docker-compose.yml` (`pnpm auth:up`) with the same realm. `apps/api/.env.example` now points at it.
- API: in production, the JWKS URL may use plain http only for an internal single-label host such as `keycloak`, never for a LAN or public address (5 new validation tests).
- Web: middleware no longer language-prefixes `/session/*`, so the OIDC callback URL stays exactly as registered.
- `.gitattributes`: LF line endings for files used in containers, so Windows clones don't break shell scripts.

### Bugs found while verifying

- **Backup failure was silent.** With the database stopped, `backup.sh once` reported `backup ok` for a 0-byte dump and health stayed green, because `set -e` is ignored inside a function called with `||`. Every step now checks its own exit status, and dumps under 1 KB are rejected. Re-tested: exit 1, `LAST_FAILURE.txt` written, health unhealthy, no partial files. The next good backup clears it.
- **The OIDC callback was rewritten to `/en/session/callback`** by the language middleware. Fixed as described above.
- **Prisma could not detect OpenSSL** in the slim image. Switched to the full `node:22-bookworm` image (T-19).
- Verification-script bugs fixed along the way: the TOTP secret is read from the manual-entry key, and Keycloak's order of required actions is handled.

### Commands run and results (2026-11-25; Linux container with Docker 29.9.3, images pulled via `mirror.gcr.io` because Docker Hub rate-limited and quay.io is blocked here)

| Command | Result |
|---|---|
| `docker build -f deploy/Dockerfile` | ✅ about 2.5 min; image 3.44 GB; `openssl version` and Prisma client load inside it |
| `docker compose -f deploy/docker-compose.prod.yml up -d --wait` | ✅ 9 services healthy, migration job exited 0 |
| `node deploy/scripts/verify-deployment.mjs` | ✅ 13/13 (details below) |
| Restore drill using the same steps as `restore.ps1` | ✅ backup taken, row added, safety backup, stop, restore of both DBs, start: the added row was gone, all services healthy, 13/13 again |
| Backup failure drill (database stopped) | ✅ after the fix: exit 1, `LAST_FAILURE.txt` written, health exit 1, no partial or empty dumps |
| `docker compose down`, then `up` (simulated reboot) | ✅ users and audit rows unchanged, HTTPS root CA unchanged, 13/13 |
| PowerShell (pwsh 7.4 container): parse all 12 scripts, then `deploy/windows/tests/ErpShop.Tests.ps1` | ✅ all parse; 9/9 helper checks |
| Dev `pnpm auth:up` and `bootstrap-admin.sh` | ✅ realm imported, issuer `http://localhost:8080/realms/erp`, user created |

The 13 deployment checks:
1. HTTPS certificate chains to the exported shop root CA.
2. API readiness through the proxy.
3. Discovery returns the public issuer.
4. A request without a token gets 401.
5. Direct password grant is refused.
6. A Keycloak user is created needing a password change and TOTP.
7. That user is provisioned as ERP platform admin.
8. Browser sign-in completes both required actions; the TOTP code is computed by the script.
9. A second sign-in uses the SSO session without prompting.
10. A wrong PKCE verifier is rejected (`invalid_grant`).
11. The right verifier gives a token with `iss` = public issuer, `aud` ∋ `erp-api` and `sub` = Keycloak id.
12. The API accepts the token, and `/me` shows a platform admin.
13. A backup is taken and verified by restoring it.

### Not verified

- **Not yet run on the real Windows PC.** The PowerShell scripts were parsed and their pure helpers tested under pwsh on Linux; the commands that call Docker were exercised through the same compose commands on Linux. Still untested on Windows: Docker Desktop on Windows, Windows backup-folder paths, `Import-Certificate`, and the guide itself.
- Installing the CA on real staff phones (Android and iOS), and auto-start after a real Windows reboot.
- The `deploy-verify` CI job has not run on GitHub (Actions availability is unknown).
- Image size (3.4 GB) is not optimized (T-19).

### Next task

P1-10: web ERP sign-in (`/session/*` with the `erp-web` client, server-side session) and screens for companies, chart of accounts, periods, journals and the audit trail. Then manager app sign-in with `erp-manager-mobile` (L-06).

## 2026-11-25: Moved to its own repository

- The project moved from `erp/` in `Abdallah-hanini/my-profile-` to the root of `Abdallah-hanini/my_shope`. `git subtree split` kept its five commits.
- The CI workflow moved to `.github/workflows/ci.yml`, with paths updated for the repository root.
- Earlier entries below mention `erp/` and the profile repo. They describe history and are left unchanged.
- **Fix found by the clean checkout:** the API unit-test task depended on a Prisma client generated by an earlier build. On a fresh install it failed with `Cannot find module '.prisma/client/default'`. The `test` and `test:integration` scripts now run `prisma generate` first.
- **Verified from a fresh `git worktree` checkout and a new database (`erp_shop_clean`):**

| Command | Result |
|---|---|
| `pnpm install --frozen-lockfile`, `pnpm format:check` | ✅ |
| `pnpm turbo run build typecheck lint test` | ✅ 48/48 tasks, 119 unit tests |
| `pnpm db:migrate` run twice, then `pnpm db:migrate:check` | ✅ applied, then "No pending migrations", then "No difference detected" |
| `pnpm --filter @erp/api test:integration` | ✅ 57/57 |
| `pnpm --filter @erp/worker test:integration` | ✅ 2/2 |
| `pnpm test:smoke` | ✅ 11/11 |
| `pnpm contracts:check` | ✅ exit 0 |

- GitHub Actions has not run yet in this repository. Whether Actions works here depends on the account billing issue noted earlier.

## 2026-11-25: Owner decisions on deployment

- This is a separate project for the owner's shop. It moves to a new GitHub repository (link pending), keeping its history.
- Runs on one Windows PC in the shop. One company, one branch. Staff only, on the shop Wi-Fi. The customer app is postponed.
- Recorded in [docs/DECISIONS.md](docs/DECISIONS.md) (D-01 and D-02 decided, D-03 proposed as local Keycloak, plus L-01 to L-06).

## 2026-11-25: Phase 1, API slice (identity, organization, accounting)

**Approval:** the owner approved the Phase 0 gate ("Approve").
**Decisions still open:** D-01 to D-04 were not answered. Work was limited to items that are reversible and independent of them (see assumptions).
**Requirement IDs:** ADM-001 (partial), ADM-002, ADM-007, ACC-001, ACC-002, ACC-008, SEC-03, SEC-04 (API side), SEC-05, SEC-06, ARCH-13 (write side). Plan: [docs/PHASE1_PLAN.md](docs/PHASE1_PLAN.md). Design: [docs/ERD_PHASE1.md](docs/ERD_PHASE1.md).

### Changes

- **Migration** `20261125172931_phase1_identity_org_accounting`: org, iam, platform and accounting tables.
  - Composite `(company_id, id)` foreign keys, so a row cannot reference another company's row.
  - Hand-written, reviewed SQL. The DB blocks UPDATE, DELETE and TRUNCATE on journals, lines and audit events.
  - A deferred trigger checks at commit that each journal balances and has at least 2 lines.
  - Journals need an open period containing the posting date (taking `FOR SHARE` on the period); lines need active posting accounts.
  - An exclusion constraint stops periods overlapping, and the DB blocks reopening a closed period.
  - A `NULLS NOT DISTINCT` unique index stops duplicate role assignments.
- **Authentication:** works with any OIDC provider (jose and JWKS). It checks issuer, audience, expiry and algorithm allow-list. Users are provisioned explicitly; unknown or inactive users get 403. Production refuses to start without OIDC settings.
- **Authorization:** roles per company, assigned company-wide or per branch, with a permission catalog in `@erp/validation`.
  - The permission guard answers 404 for a company where the caller has no role.
  - List queries are filtered to the caller's branches.
  - Users cannot grant or revoke permissions beyond what they hold.
- **Endpoints:**
  - `GET /me`
  - `POST /users`
  - companies: create, list, get
  - branches, roles, role assignments (including revoke), audit events
  - accounts, fiscal periods (including close with an optimistic version check)
  - journals: post, list with a cursor, get, reverse
- **Posting:**
  - `Idempotency-Key` is required. The same key and body replays the original; the same key with a different body returns 409.
  - Numbers are gapless per company and year (`JV-2026-000001`).
  - Money is exact decimal and must fit the currency's minor units.
  - The audit event and outbox event are written in the same transaction as the journal.
  - A reversal is a mirror journal. Only one is allowed per journal, it cannot be dated before the original, and a reversal cannot itself be reversed.
- **Bootstrap CLI** `iam:bootstrap-admin`: creates the first platform administrator; idempotent and audited.
- **Error mapping:** our own DB rule violations become 422 with a safe message, unique conflicts become 409, everything else stays a generic 500. 401 responses carry `WWW-Authenticate: Bearer`.
- **Contracts:** regenerated (17 paths). A unit test keeps Swagger request DTOs in sync with the Zod schemas.
- **Smoke test:** the API now gets placeholder OIDC settings, since production requires them. Added a check that `/me` without a token returns 401, and the harness now fails fast when a process exits.
- **Fixes during this work:**
  - The balance trigger referenced `NEW.journal_id` on the `journal` table; it now reads the id through `to_jsonb`.
  - An idempotent replay could return a journal from a branch outside the caller's scope; scope is now checked first, with a regression test.
  - The mobile tests had act() warnings left over from Phase 0; they now wait for the rendered result.

### Commands run and results (2026-11-25, same container)

| Command | Result |
|---|---|
| `pnpm install --frozen-lockfile`, `pnpm format:check` | ✅ |
| `pnpm turbo run build --force` / `typecheck --force` / `lint --force` | ✅ 12/12, 20/20, 20/20 |
| `pnpm turbo run test --force` | ✅ 119 unit tests: validation 34, api 45, localization 11, design-tokens 5, worker 5, api-client 4, web-ui 1, web-erp 8, customer-mobile 3, manager-mobile 3. No console errors |
| Fresh database `erp_gate_p1`: `pnpm db:migrate`, then again | ✅ 2 migrations applied, then "No pending migrations" |
| `pnpm db:migrate:check` (fresh shadow DB) | ✅ "No difference detected" |
| `pnpm --filter @erp/api test:integration` | ✅ 57/57. Covers authentication (7), tenant isolation (6), roles/scope/escalation (7), posting (15, including 10 concurrent requests with one key giving one journal, and 20 concurrent postings numbered 1–20 with no gaps), reversals (3, including a concurrent double reversal giving exactly one), periods (4, including a deterministic lock test showing a close blocks while a posting holds the period), DB defenses with the API bypassed (6), audit API (2), and the Phase 0 health tests (6) |
| `pnpm --filter @erp/worker test:integration` | ✅ 2/2 |
| `pnpm test:smoke` | ✅ 11/11 |
| `iam:bootstrap-admin` run twice, plus once with invalid input | ✅ one user and one audit event; invalid input rejected |
| `pnpm contracts:check` (after commit) | ✅ exit 0: committed OpenAPI and types match the API |

### Not done or not verified

- **No client screens yet (P1-10).** The web ERP and manager app cannot sign in until an OIDC provider is chosen (D-03). The spec's per-module UI requirements (list, detail, empty and error states) are therefore not met for Phase 1 modules yet.
- Outbox relay (P1-11): events are written but not yet published.
- Maker-checker and approval matrix (P1-12, D-11): manual journals post immediately for anyone with `accounting.journal.post`.
- Not implemented yet: company/branch/account update and deactivation, period reopen, cost centers, multi-currency.
- No rate limiting or MFA enforcement yet. MFA belongs to the OIDC provider (D-03); rate limiting is planned with hardening.
- **CI on GitHub still has not run** (Actions blocked by billing). All steps were run locally.
- Local note: the original dev database `erp` has an earlier, faulty draft of the Phase 1 migration applied, from before the trigger fix. Prisma's safety check correctly blocked me from resetting it, and I did not drop it. Before using it, recreate it with `pnpm db:down` and remove the `pgdata` volume, or point `DATABASE_URL` at a fresh database. CI and fresh databases are unaffected.

### Assumptions (pending owner decisions)

- D-02: the model supports any number of companies. No consolidation or intercompany logic yet.
- D-03: provider-agnostic OIDC; no provider selected or configured.
- D-04 and D-05: no chart template, posting matrix or tax. The chart is built through the API.
- D-07: one currency per company (its base currency). The currency list in `@erp/validation` is a starting set.

### Next task

1. P1-10: web ERP screens for companies, chart of accounts, periods, journal entry, journal list/detail and audit trail. Also manager app read-only journal and period views. Both need D-03, or an agreed dev OIDC provider such as a local Keycloak container.
2. P1-11: outbox relay in the worker.
3. P1-12: maker-checker once D-11 thresholds are agreed.

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
