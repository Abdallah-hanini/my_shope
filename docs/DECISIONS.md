# Decisions and open questions

## Blocking business decisions (owner input required)

None of these block Phase 0. Each blocks the listed production features; work on them stays disabled or synthetic until answered.

| # | Decision needed | Blocks | Needed by |
|---|---|---|---|
| D-01 | ~~Jurisdiction(s) of operation and data residency~~ **Decided 2026-11-25: on-premises. All data stays on the shop's Windows PC.** Country/tax jurisdiction still to confirm | Hosting region, tax, payroll law, privacy/consent rules | Phase 1 |
| D-02 | ~~Legal entity structure~~ **Decided 2026-11-25: one company, one branch (one shop).** The model still supports more if the business grows; no intercompany work planned | Company/branch model, consolidation, ACC-017 | Phase 1 |
| D-03 | ~~Identity provider~~ **Decided 2026-11-25: Keycloak 26, self-hosted on the shop PC** (realm `erp`, TOTP required for administrators) | Login on all 3 clients, MFA, step-up auth | Phase 1 |
| D-04 | Chart of accounts template and posting matrix sign-off by the accountant | ACC-001/002, every posting in docs/ACCOUNTING.md | Phase 1 |
| D-05 | Tax regime and rates (VAT applicability, effective dates) | ACC-010, invoices, POS | Phase 1–3 |
| D-06 | Inventory costing method: FIFO or weighted average, per company or per product | INV-010, COGS, stock valuation | Phase 2 |
| D-07 | Base currency, functional currencies and FX rate source | ACC-010, PRC-009 | Phase 1–2 |
| D-08 | Payment providers (card/online) and webhook model | POS-003, customer app checkout | Phase 3–4 |
| D-09 | SMS/OTP, email and push messaging vendors | Customer registration/OTP, CRM-003, notifications | Phase 4 |
| D-10 | Payroll law, end-of-service formula, leave rules | HR-005, HR-011, payroll posting | Phase 6 |
| D-11 | Approval thresholds and maker-checker matrix | ADM-003, discounts, refunds, POs, stock adjustments | Phase 1–3 |
| D-12 | Mobile app names, bundle identifiers, Apple/Google developer accounts | Store builds; current IDs are placeholders `com.example.erp.{customer,manager}` | Before Phase 4 device builds |
| D-13 | Supported iOS/Android versions and target devices | Mobile test matrix | Phase 4 |
| D-14 | Opening balances, initial catalog source and data migration scope | ACC-014, INV imports | Phase 1–2 |

## Owner decisions (2026-11-25)

- The ERP is a **separate project for the owner's shop**. It now lives in its own repository, `Abdallah-hanini/my_shope`, with its git history.
- **Deployment: one Windows PC in the shop** (on-premises), not cloud hosting.
- **Users: shop staff only, on the shop Wi-Fi, for now.** The customer app (and so online booking, ecommerce and payments, D-08) is **postponed by the owner**. It needs internet exposure (tunnel or cloud) and is revisited later. This narrows the spec, where both mobile apps are mandatory for the full release; the full release gate is unchanged.

### Consequences to implement

| # | Item | Notes | Status |
|---|---|---|---|
| L-01 | Production Docker Compose for Windows (Docker Desktop + WSL 2): PostgreSQL, Redis ×2, API, worker, web, Keycloak, reverse proxy; auto-start on boot | Bound to the shop LAN, not the internet | Done (verified): `deploy/docker-compose.prod.yml`, `deploy/Dockerfile`, Windows scripts in `deploy/windows/` |
| L-02 | **Automated database backups** to a second disk or USB drive on a schedule, with retention and a documented, tested restore | One PC means one point of failure; this replaces the cloud PITR assumption (RPO/RTO to be agreed) | Done (verified): `deploy/backup/backup.sh` (every 6 h, checksums, retention, failure flag, health), `restore.sh`, `verify` restore check |
| L-03 | HTTPS on the LAN (local certificate authority trusted by staff devices) | Mobile platforms block plain HTTP by default; tokens must not cross Wi-Fi unencrypted | Done (verified): Caddy `local_certs` CA; `export-ca.ps1` |
| L-04 | Keycloak realm for staff, with MFA for administrators (once D-03 is confirmed) | Unblocks P1-10 screens | Done (verified): `deploy/keycloak/realm-erp.json`, `add-admin.ps1` (password change + TOTP enrolment forced) |
| L-05 | Windows install/upgrade/restore guide for a non-developer | Plus UPS (power backup) recommendation | Done: `docs/DEPLOY_WINDOWS.md` (not yet tried on a real Windows PC) |
| L-06 | Manager app distributed internally (Android APK or TestFlight/ad hoc) rather than public store listing | Revisits D-12 | Open: needs the manager app sign-in (next change) |
## Technical decisions taken in Phase 0 (reversible)

| # | Decision | Why | Revisit when |
|---|---|---|---|
| T-01 | ~~ERP lived in `erp/` inside the profile repository~~ **Moved 2026-11-25 to its own repository `Abdallah-hanini/my_shope`, history preserved (git subtree split)** | Owner request | — |
| T-02 | Stable majors: Next 15.5, NestJS 11, Prisma 6.19, Expo SDK 54 (React Native 0.81, React 19.1.0), Node 22 | Mature, mutually compatible releases; React pinned once across web and mobile to avoid duplicate React in the hoisted install | Quarterly dependency review; newer majors (Next 16, Nest 12, Prisma 7/8, Expo 55+) exist and need a planned upgrade |
| T-03 | `node-linker=hoisted` in `.npmrc` | Most reliable Metro resolution for Expo in a pnpm monorepo | Expo isolated-install support is verified for this repo |
| T-04 | Shared packages compile to CommonJS `dist/` | One format consumable by Nest (CJS), Next and Metro without transpile config | Moving the API to ESM |
| T-05 | Express platform for Nest (not Fastify) | Default, widest middleware support (helmet etc.) | Load tests show a need |
| T-06 | Domain separation by PostgreSQL schema; Phase 0 migration creates empty schemas only | docs/ARCHITECTURE.md "Postgres schemas by domain" | Phase 1 ERD review (Prisma `multiSchema` for models in these schemas) |
| T-07 | API connects to DB/Redis lazily; readiness, not startup, reports dependency failures | API can start, report 503 and recover when dependencies return | — |
| T-08 | Integration tests live in separate Jest configs and **fail** (never skip) without services | Charter forbids skipped tests | — |
| T-09 | Customer app display name "Automotive Care", manager "Automotive Manager" | Placeholders | D-12 |
| T-10 | Worker readiness depends only on the queue Redis for now | Worker has no DB work until the outbox relay (Phase 1) | Phase 1 adds DB check |
| T-11 | `jose` 5.10 (not 6) for JWT verification | jose 6 is ESM-only; the API and Jest run as CommonJS | API moves to ESM |
| T-12 | Sign-in accepts any OIDC provider through `OIDC_ISSUER` / `OIDC_AUDIENCE` / `OIDC_JWKS_URL`; users are provisioned explicitly (no auto-sign-up); permissions come only from the database, never from token claims | Keeps D-03 open without mock auth | D-03 decided |
| T-13 | A company the caller has no role in answers 404, not 403 | Prevents probing company ids (IDOR) | — |
| T-14 | Platform administrators can create companies and users and manage role assignments in any company, but they have no ledger access unless a role is assigned. They *can* assign a role to themselves; that is audited (break-glass) and not yet blocked | Least privilege by default, plus a recoverable operator account | D-11: require a second approver for platform-admin self-grants |
| T-15 | Journals are stored only when posted (no drafts yet); manual posting needs `accounting.journal.post` and is not yet subject to maker-checker | Approval thresholds are D-11 | P1-12 |
| T-16 | Money crosses the API as decimal strings; amounts with more decimals than the currency allows are rejected, not rounded | No float error and no silent rounding | D-07 for FX rounding rules |
| T-17 | Journal numbers `JV-<year>-<000001>` are gapless per company and posting year (sequence row locked inside the posting transaction) | Common audit expectation; cost is serialized posting per company | Load tests show contention |
| T-18 | Period reopen is blocked in the database until the approval workflow exists | Prevents silent changes to closed books | P1-12 |
| T-19 | Shop-server image built on the PC from `node:22-bookworm` (full image, ~3.4 GB including build tooling) | Includes the openssl binary Prisma needs, so the build needs no Debian package download | Slim runtime stage with pruned dependencies once stable |
| T-20 | Caddy terminates HTTPS with its own local CA; Keycloak and the API run behind it on the private Docker network; the API reads Keycloak signing keys over internal `http://keycloak:8080` | Nothing but port 443 is published; plain http is allowed only for single-label internal hosts (validated) | — |
| T-21 | Keycloak admin console is reachable on the LAN at `/auth/admin` (protected by the admin password); Docker Desktop NAT hides client IPs, so IP allow-listing would not work | Usable from the shop PC | Restrict further if the network grows |
| T-22 | `.gitattributes` forces LF for everything except PowerShell scripts | Git for Windows would otherwise convert shell scripts used inside containers to CRLF | — |
