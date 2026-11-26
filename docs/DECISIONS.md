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
| T-23 | Web sign-in is handled by the Next.js server (`openid-client`, authorization code + PKCE + state + nonce). Tokens stay on the server in an AES-256-GCM-encrypted, httpOnly, SameSite=Lax cookie (split into chunks under 4 KB); the browser never sees them | No token storage in JavaScript; no extra session store to run on the PC | A server-side session store if sessions need central revocation beyond Keycloak's |
| T-24 | The web server calls Keycloak's token and key endpoints over the private network (`http://keycloak:8080`) but validates tokens against the public issuer; endpoints are configured explicitly (no discovery) | The web container cannot verify the shop's local HTTPS certificate, and does not need to leave the Docker network | — |
| T-25 | Access tokens are refreshed by redirecting through `/session/refresh` (pages) or in place (server actions); sign-out is POST-only with an Origin check and also ends the Keycloak session | Server Components cannot set cookies; prevents cross-site forced sign-out | — |
| T-26 | No `loading.tsx` in the company section | With it, Next.js 15.5 intermittently left forms on "Saving…" after a server-action redirect (about 1 run in 4 in the browser test; 4/4 clean without it) | Re-test on Next.js upgrades |
| T-27 | Amounts are shown exactly as the API returns them (decimal strings, left-to-right digits) rather than locale-formatted | Avoids converting money to floating point for display | Add exact locale formatting later if Arabic-Indic digits are wanted |
| T-28 | Charts keep a left-to-right time axis in Arabic too; only the legend and layout mirror | Common in Arabic financial dashboards; inverting the axis made axis labels collide with bars | Owner preference |
| T-29 | Product brand "AUTO360" (per the UI/UX specification) in the app shell; the Keycloak realm display name stays "My Shop ERP" | Spec naming; realm text is editable in Keycloak | Owner confirms brand and logo |
| T-30 | Fonts self-hosted through @fontsource (Inter, IBM Plex Sans Arabic) | Works offline on the shop LAN; no third-party font requests | — |
| T-32 | Staff sign-in accounts are created by the API through a dedicated Keycloak service client `erp-api-admin` (client-credentials only), holding only the realm-management roles manage-users, view-users and query-users. It is created by `deploy/scripts/keycloak-ensure-api-client.sh` on install, upgrade and `pnpm auth:up` | Owner can add staff from the ERP without the Keycloak console; the client cannot change realm settings, clients or roles (verified by deployment check 15: users 200, authentication flows 403, clients 403; reading realm roles is allowed because Keycloak needs it for role mapping). Caveat: Keycloak's manage-users also covers every user of the realm, so the ERP's own checks (company scope, no escalation, no self-change, platform admins only by platform admins) are what limit an ERP administrator. **Open:** a test that the service account cannot give itself Keycloak admin roles was not run (blocked in this environment); the ERP never calls role-mapping endpoints | Fine-grained admin permissions (Keycloak FGAP v2) if more than one company shares the realm |
| T-33 | A new or reset password is a random 16-character temporary password, returned once in the API response (`Cache-Control: no-store`), shown once in the page and never stored, logged or audited; Keycloak forces a change at first sign-in (plus authenticator enrolment by default) | No mail server is decided (password recovery needs SMTP); this is the safe hand-over without one | SMTP decision: switch to an emailed set-password link |
| T-34 | Onboarding spans Keycloak and PostgreSQL: the sign-in account is created first, then the ERP user and role in one transaction; if that fails the new sign-in account is removed, unless an ERP user is already linked to it. Deactivation changes Keycloak first and reverts it if the database update fails; the API also refuses inactive users on every request | No distributed transaction is available; compensation with guards keeps both sides consistent and never deletes someone else's account | — |
| T-35 | Any member of a company may read the company header (`GET /companies/{id}`: name, currency, time zone) without `org.company.read`; others get 404 | Every screen needs it; found by the e2e check where a journal-only role could not open the company | — |
| T-36 | Trial balance needs `reports.financial.read`; general ledger needs `accounting.journal.read` | The ledger shows the same lines as the journal screens, by account; the trial balance is a financial statement | Owner review of role design |
| T-37 | No year-end closing yet: revenue and expense balances in the trial balance accumulate from the first journal; the screen says so | Closing to retained earnings needs the accountant's fiscal-year and equity-account decisions (D-04) | Accountant decision on fiscal year and retained-earnings account |
| T-38 | Breadcrumb section and language-switch link are derived from the URL in the browser | Next.js keeps layouts mounted on in-app navigation, so server-computed values went stale (found in this increment's screenshots) | — |
| T-31 | Reports classify accounts only through an explicit `reporting_class` (cash, bank, receivable, payable, inventory, COGS), checked against the account type in the database | KPIs must not guess from names; the accountant controls classification (D-04) | Accountant review |

## AUTO360 UI/UX specification: conflicts and scope (2026-11-25)

- **Customer app (71 CUS screens):** the owner postponed it (staff-only on Wi-Fi). The catalog lists these screens as "Postponed" and keeps them in the plan.
- **Owner demonstration mode:** the spec asks for synthetic fixtures (150 customers, 500 parts, 100 jobs…) covering workshop, inventory, procurement and POS, which do not exist yet. The charter forbids mock production functionality, so the demo will be a separate, clearly labelled environment with its own database and demo adapters, built after those modules. The suggested figures (revenue 425,000 …) are used only if the fixtures reconcile; `kpi.test.ts` checks the formulas with exactly those numbers.
- **Global search and notification inbox** in the shell are hidden until implemented (no dead buttons).
- **WEB-219 password recovery** needs an email (SMTP) provider decision. Until then, administrators reset passwords in Keycloak.
