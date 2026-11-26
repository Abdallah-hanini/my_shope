# Delivery status

## Summary

| Phase | Status |
|---|---|
| 0 Foundation | **Approved by the owner on 2026-11-25.** |
| 1 Identity/org/accounting | **In progress.** API (P1-01 to P1-09) and web ERP screens with staff sign-in (P1-10, web part) are implemented and verified. Still to do: manager app sign-in and screens, maker-checker (P1-12, needs D-11) and opening balances (P1-13, needs D-14). Gate not yet claimed. |
| AUTO360 UI/UX | **Increment 1 done:** audit, catalog (380 views), design system, app shell, executive dashboard (WEB-001). **Increment 2 done:** users, roles and permission matrix (WEB-224/225/226). **Increment 3 done:** trial balance and general ledger (WEB-122/100). **Increment 4 done:** global search (WEB-237). **Increment 5 done:** export centre (WEB-205). **Increment 6 done:** notification inbox with the outbox dispatcher (P1-11). |
| Shop server (L-01 to L-05) | **Implemented and verified on Linux Docker.** Not yet installed on the real Windows PC. |
| 3 Sales/POS/workshop | **Started:** workshop job cards first slice (customers, vehicles, check-in, tasks, assignment, lifecycle with QC and rework, delivery, board). No prices, quotations, parts or invoices yet (need D-05 tax, D-06 costing). |
| 2, 4–7 | Not started. |

## 2026-11-27: Check-in inspection and photos (WMS-003, WEB-015)

### Changes

- **Checklist (T-56):** 14 points in four groups (exterior, interior, under the bonnet, equipment and belongings), each OK, needs attention (note required) or not checked.
  - Recorded by managers while the job is a draft; authorisation is refused until it exists.
  - Fixed afterwards: the API refuses changes and a database trigger blocks them. Shown in the timeline.
- **Photos (T-57, T-58):** upload up to 5 at a time with an area (front, rear, left, right, interior, odometer, damage, other) and a caption.
  - Managers can add photos while the job is open; technicians only on jobs they work on (damage found during work).
  - Every file is decoded and re-encoded: non-images are refused, orientation is applied, all metadata including GPS location is removed, images are scaled to at most 2048 px, and a thumbnail is made.
  - Stored with a SHA-256; the audit records hashes, never image bytes.
  - Removable only while the job is a draft, and never editable (database triggers). Limit of 40 per job.
  - Served only to people who can see the job, through a web route that keeps the token on the server.
- **Migration `checkin_inspection_photos`:** inspection items and photos tables, checks, triggers, and new timeline kinds. It stops with a clear message if any existing job is past draft (none were).
- **Web:** the job details page has a "Check-in inspection" form (read-only after authorisation) and a "Photos" gallery with upload, full-size view and remove.

### Evidence (2026-11-27, Linux Docker)

- Unit tests:
  - photo processing 4: re-encode and scale; GPS and EXIF removed; orientation applied; non-images, GIF and truncated files refused;
  - lifecycle 6, validation 76.
- Integration (checkin.int, 7):
  - checklist rules and lock (API and database);
  - metadata really removed from the stored file, with the expected headers;
  - non-image, too many files, oversized file (413) and unknown area refused with nothing stored;
  - who may add and remove photos, and evidence locked after authorisation (API and database);
  - branch isolation, audit without bytes, the 40-photo limit.

  The workshop suite was updated for "inspection before authorisation".
- Browser end-to-end: the check-in flow now records the inspection (one item needing attention) and uploads a photo whose thumbnail loads at 320 px. After authorisation the inspection is read-only and photos cannot be removed.
- Full gate: format clean; build, typecheck, lint and unit tests 48/48; migration drift none; smoke 11/11; integration 159/159 across 9 suites on a fresh database; browser end-to-end 38/38.

## 2026-11-26: Workshop job cards, first slice (Phase 3: WMS-001/006/010/011)

### Changes

- **Data (migration `workshop_job_cards`):**
  - schemas `crm` (customer, vehicle) and `workshop` (job_card, job_task, job_event);
  - database checks for statuses, fuel level, odometer, authorisation required after draft, delivery and cancellation details, and task completion;
  - the timeline is append-only (trigger); delivered and cancelled jobs cannot be changed (trigger);
  - company administrators receive the six new permissions.
- **Permissions:** `crm.customer.read/manage`, `workshop.job.read/manage/work/qc`. Jobs are branch-scoped.
- **Lifecycle (T-51…T-53):**
  - draft → approved (customer authorisation recorded) → assigned (every task has a technician of the branch) → in progress → quality check → ready → delivered;
  - a failed check moves to rework and reopens the chosen tasks; cancel with a reason;
  - each step is checked for status, permission, ownership (technicians complete their own tasks) and version, and writes a timeline event, audit and outbox event in one transaction;
  - the inspector cannot be a technician on the job.
- **Notifications:** technician assigned to a task; rework for its technicians; job ready for the person who opened it.
- **Search:** job cards (number, plate), vehicles (plate also without spaces, VIN, make and model) and customers (name, phone).
- **Web:**
  - Workshop menu: Job cards (board by status and list), New job card (check-in with task rows), job details (tasks with assignment and "Mark done", one panel per allowed step, timeline);
  - Vehicles (registry, profile with service history, owner transfer, "Check in");
  - Customers (list, detail with vehicles).
  - English and Arabic, phone layout.

### Evidence (2026-11-26, Linux Docker)

- Unit tests: lifecycle rules 5, validation (plates, VIN, job and QC schemas) 73, web helpers (time zone) 35.
- Integration (workshop.int, 16), including:
  - customers and vehicles: normalised unique plates, VIN check, audited owner transfer, version conflicts;
  - the full lifecycle with an advisor, two technicians, an inspector and a technician from another branch, including refusals (403/409/422), and two simultaneous "start" requests producing one change;
  - the inspector-not-on-job rule; QC failure reopening a task; delivery odometer check; closed-job immutability (database trigger); authorisation required after draft and an append-only timeline (database);
  - branch isolation, service history, notifications, plate search without spaces;
  - new administrators receiving the permissions.
- Browser end-to-end (new checks):
  - register a customer and vehicle (plate normalised), check in with two tasks, record authorisation, assign both tasks, start, mark done, send to quality check;
  - the person who did the work sees "Waiting for the quality check by an inspector", not the inspection form;
  - timeline order; board column "Quality check"; plate search; Arabic phone layout of the workshop pages.
- Full gate: format clean; build, typecheck, lint and unit tests 48/48; migration drift none; smoke 11/11; integration 152/152 across 8 suites on a fresh database; browser end-to-end 38/38.

### Not done / open

- Prices, quotations and approval of a quoted amount (WMS-005), parts reservation and issue (WMS-008), invoices and payment: need **D-05 (tax)** and **D-06 (costing)**.
- Photos and inspection checklist at check-in (WEB-015), appointments (WEB-010/011), labour time clocking (WEB-023), extra work requests (WEB-025), bays (WEB-022).

## 2026-11-26: AUTO360 UI/UX increment 6 (notification inbox, outbox dispatcher P1-11)

### Changes

- **Outbox dispatcher (T-47):** delivers each committed business event in one transaction with the notifications it creates, then marks it published.
  - Several instances can share the work safely.
  - Failures are retried with backoff (2 s up to 1 h) and dead-lettered after 10 attempts.
  - Dead letters are logged as errors and counted in the health report and on the home status panel (information only; the API stays "up").
  - Housekeeping removes delivered events after 30 days and read notifications after 90 (T-50).
- **Events record who acted:** `enqueueOutbox` now stores the actor (new column). Exports emit `export.completed` when they finish, fail or are interrupted.
- **Migration `notifications`:**
  - table `platform.notification` (unique per event and person; closed list of kinds; links limited to paths inside the company);
  - outbox columns `actor_user_id` and `dead_lettered_at`;
  - events from before the dispatcher are marked delivered without notifying anyone (T-49).
- **Rules (T-48):**
  - journal reversed → original poster;
  - role given or removed → that person;
  - role changed → its holders;
  - period closed → people who post journals (link only if they can open periods);
  - export ready or failed → requester.

  Nobody is told about their own action or about records they cannot see. No amounts in messages.
- **API:** inbox list (keyset pages, unread only), unread count, mark read, mark all read. Own messages only; non-members get 404.
- **Web:**
  - Header bell with the unread count, fetched in the browser (refreshes on navigation, every 30 s and after inbox changes).
  - Inbox page (All / Unread, Open → record, Mark all as read, Older) in English and Arabic.
  - Breadcrumb entries for pages reached from the header.

### Evidence (2026-11-26, Linux Docker)

- Unit tests: API 66, web 31 (message text in both languages), localization 19, validation 67.
- Integration on a fresh database: 136/136 across 7 suites. The 14 new notification tests cover each rule, self-actions and invisible records excluded, no duplicates on replay, unknown events, retry and dead-letter with health report, housekeeping, link check, inbox API, isolation, and real background delivery.
- Format, build, typecheck, lint and unit tests 48/48; migration drift none; smoke 11/11.
- Browser end-to-end: 36/36. New checks:
  - the owner's two finished exports reach the bell ("Notifications: 2 unread") and the inbox;
  - "Open" goes to the export centre and the badge drops to 1; "Mark all as read" clears it;
  - the staff member's inbox says "E2E Owner gave you the role “Company administrator” (All branches)." and "… removed your role …";
  - Arabic phone layout of the inbox.

### Not done / open

- Notification settings, email or phone push (WEB-229, ADM-008) need the mail-server decision; the manager app has no notifications yet.
- No notification yet for approvals (maker-checker, P1-12, needs D-11).

## 2026-11-26: AUTO360 UI/UX increment 5 (export centre)

### Changes

- **API:** `POST /companies/{id}/exports` (202) and `GET` list, detail and download.
  - Kinds: trial balance, general ledger and journal lines, as CSV or Excel, with English or Arabic labels.
  - Each kind needs the permission of its screen. The requester's current scope is applied when the file is produced.
  - Downloads are for the requester only, with the permission and branch coverage checked again. Every request and download is audited. Limit: 3 in progress per person.
- **Processing (T-41):** BullMQ queue `exports` in the API process.
  - PostgreSQL is authoritative: a conditional claim makes a replayed message a no-op.
  - A sweep each minute re-queues lost jobs, fails interrupted ones and deletes expired files.
- **Migration `export_centre`:** table `platform.export_job` with checks: closed vocabularies; a file exists exactly while the job is "succeeded"; a failure always has a reason.
- **Files (T-42, T-43):**
  - CSV: UTF-8 with BOM, formula-injection-safe.
  - Excel (ExcelJS): numeric money, frozen header, filter, right-to-left in Arabic, and an "About" sheet describing how the file was produced.
  - Kept 7 days. PDF via the browser's Print → Save as PDF, with new print styles.
- **Web:** Finance → Export centre (request form, own exports with live status, download through a route handler that keeps the token on the server), and "Export" on the trial balance and general ledger pages.
- **Fixes:**
  - Table scroll containers are now `position: relative` (T-46): a screen-reader label widened the page on phones.
  - The drift check failed on its second run (T-45).

### Evidence (2026-11-26, Linux Docker)

- Unit tests: validation 67, API 66 (writers: CSV quoting and formula safety, Excel read-back), web 28.
- Integration on a fresh database: 122/122. The 14 export tests cover:
  - the file equals the screen for all three kinds (trial balance row by row and totals; general ledger across pages; journal lines with a branch filter);
  - Arabic Excel, branch-limited staff scope, isolation between people, permission recheck (403), failure when the permission is removed before processing;
  - validation, the 429 limit, expiry 410 and sweep, the database checks, audit events, and a real BullMQ run.
- Browser end-to-end: 35/35. New checks:
  - the trial balance exported to Excel from its page, downloaded and opened: totals 200.20 on both sides, About sheet;
  - an Arabic CSV of journal lines with a BOM and Arabic headers, with the download in the audit trail;
  - the staff member is offered only General ledger and Journal lines and sees no one else's files;
  - print mode hides the menu, filters and export controls and keeps the company name; Arabic phone layout of the export centre.
- Dependency audit: ExcelJS adds one moderate advisory (`uuid`), which is not exploitable here (T-44).

### Not done / open

- No server-generated PDF, and no scheduled or emailed reports (they need a mail-server decision).

## 2026-11-26: AUTO360 UI/UX increment 4 (global search)

### Changes

- **API:** `GET /companies/{id}/search?q=&limit=` covers journals (number, description), accounts (code, name, Arabic name), branches, fiscal periods and people.
  - Each record type requires its list permission and applies the same branch scope. Types the caller cannot read are omitted. Outsiders get 404.
  - Matching is "contains", case-insensitive and Arabic-variant tolerant (ة/ه, أ/إ/آ/ا, ى/ي, tatweel and diacritics), with LIKE wildcards escaped. Code and number prefixes rank first.
- **Migration `global_search`:** function `reporting.search_normalize` (immutable) and trigram indexes on journal number and description. EXPLAIN confirms both indexes serve the search query.
- **Web:**
  - Header search box with the `/` and Ctrl/⌘+K shortcuts; an icon on smaller screens.
  - Results page grouped by type, with highlighted matches and links to each record (an account opens its general ledger).
  - English and Arabic, phone layout.
- **Fix:** pages outside the menu (such as search) showed "Executive dashboard" in the breadcrumb, because the company home prefix-matched every path. The home now matches only itself.

### Evidence (2026-11-26, Linux Docker)

- Unit tests: validation 66, API 64, web 28 (new navigation tests).
- Integration on a fresh database: 108/108, including 8 search tests: per-type permission, branch scope for journals, branches and people; Arabic variants; literal % and _; ranking; limit and "more"; validation; 404 for outsiders.
- Browser end-to-end: 33/33. New checks: "/" focuses the header box; results grouped by type with correct links and breadcrumb; journal-number search opens the journal; "ورشه" finds "ورشة الدوحة"; no-results message; the journal-only staff member cannot find branches or people; Arabic phone layout of the results page.

### Not done / open

- No type-ahead dropdown yet (T-39). Search does not cover journal line amounts.

## 2026-11-26: AUTO360 UI/UX increment 3 (trial balance, general ledger)

### Changes

- **API:**
  - `GET /companies/{id}/reports/trial-balance` (`reports.financial.read`): opening, period debit and credit, and closing per account in chart order. Header accounts show their descendants' sum. Debit and credit totals, a `balanced` flag, and the period result using the dashboard's net-profit formula.
  - `GET /companies/{id}/reports/general-ledger` (`accounting.journal.read`): one posting account with opening, running and closing balance, in date order with keyset pages (200 lines). Header accounts are refused with 422.
  - Both read one REPEATABLE READ snapshot of `reporting.ledger_line`, with the same branch scoping as the dashboard (shared helper `report-scope.ts`). Arithmetic is in exact decimals, in `reporting/ledger.ts`.
  - Migration `ledger_line_detail` appends line id, line number and description to the reporting view. Existing columns are unchanged.
- **Web:**
  - Finance → **Trial balance** and **General ledger**, with date range and branch filters in the URL, presets (this month, last month, this year), and Dr/Cr display.
  - Drill-down: trial balance → general ledger → journal. The chart of accounts also links each posting account to its ledger.
  - English and Arabic, phone layout.
- **Fix (T-38):** the breadcrumb and the language-switch link went stale after in-app navigation, because layouts stay mounted. Both now follow the URL in the browser. The language link also keeps the filters.

### Evidence (2026-11-26, Linux Docker)

- Unit tests: validation 65, API 63 (6 new ledger tests), web 26 (3 new), localization 19.
- Integration on a fresh database: 100/100. The 8 new tests compare against a hand-calculated fixture: Q1 totals 58,600 Dr = Cr; closing 53,000 Dr = Cr; period result −2,000, equal to the dashboard net profit; carry-forward; header roll-up; zero-activity accounts; branch trial balance; running balance; page continuity; refusals; branch-limited ledger reader.
- Browser end-to-end: 31/31. New checks: trial balance; drill-down to ledger and journal, with correct breadcrumb and language link; ledger account picker; Arabic phone layout; and the staff member sees General ledger but not Trial balance.
- Migration drift: none. Production test stack upgraded in place: migration applied, deployment checks 15/15.

### Not done / open

- Year-end closing is not set up, so revenue and expense balances accumulate from the first journal (T-37). Needs the accountant's fiscal-year and retained-earnings decisions.
- No comparison column or export yet (planned with the export centre, WEB-205, which audits exports).

## 2026-11-26: AUTO360 UI/UX increment 2 (users, roles, permission matrix)

### Changes

- **API:**
  - Staff onboarding `POST /companies/{id}/users`: creates the Keycloak sign-in account (password change at first sign-in; authenticator required by default) and the ERP user with one role assignment, in one audited step. Returns a temporary password once (`no-store`).
  - `GET /companies/{id}/users[/{userId}]`, `POST …/users/{userId}/reset-password` (also ends all sessions), `POST …/users/{userId}/status` (deactivate/reactivate with a reason).
  - `PATCH` and `DELETE /companies/{id}/roles/{roleId}` (optimistic version; system roles fixed; roles in use cannot be deleted). Role list includes member counts.
  - New permission `iam.user.manage`; migration `iam_user_manage_permission` gives it to existing company-admin roles.
  - Safety rules: no privilege escalation (only roles the caller could grant), no changing your own account or removing your own role, platform administrators and people in other companies only by a platform administrator, branch administrators limited to their branches, foreign companies 404.
  - Any member can read the company header (T-35). This was a bug: a role without `org.company.read` could not open the company.
  - Keycloak service client `erp-api-admin` with user-management roles only (T-32). Created idempotently on install, upgrade and `pnpm auth:up`. Without it the endpoints answer 503; they never fake success.
- **Web:**
  - Administration → Users (list, add staff with a one-time password panel and copy button), user profile (give or remove a role, reset password, deactivate or reactivate with a reason; your own account shows a note instead).
  - Roles (list, create with grouped permission checkboxes, edit, delete unused; system roles read-only).
  - Permission matrix (roles × grouped permissions).
  - English and Arabic labels for every permission.
- **Deployment:** new secret `ERP_API_ADMIN_CLIENT_SECRET` (generated by `install.ps1`, added by `upgrade.ps1`), passed to Keycloak and the API; the ensure script runs after Keycloak starts.

### Evidence (2026-11-26, Linux Docker)

- Unit tests: validation 64, API 57, localization 19; Windows scripts (Pester in PowerShell 7) 12/12.
- Integration tests on a fresh database: 92/92, including 22 staff tests (onboarding, compensation, duplicate username, escalation, scope, reset, deactivation, role edit and delete, self lock-out, company header for members).
- Browser end-to-end: 28/28. New checks: create a custom role and see it in the matrix; system roles read-only; add a staff member and see the temporary password once (not again after reload); duplicate username refused; the new staff member signs in (password change and authenticator) and sees only Journals and Chart of accounts, with Users refused; give and remove a role; deactivate, after which the open session is refused and Keycloak refuses the correct password because the account is disabled; the reason appears in the audit trail.
- Migration drift check: no difference.
- Production stack (Linux Docker) upgraded in place with the new secret; the migration applied and the service client was created by the ensure script. Deployment checks 15/15. The new check 15 confirms, from inside the API container, that the service account can manage users and is refused for clients and authentication flows.
- Note: the shared local development database `erp` carries a pre-commit draft of the phase 1 migration (checksum differs) and fails journal posting. Fresh databases built from the committed migrations pass. This does not affect deployments.

### Not done / open

- Password recovery by email (WEB-219) waits for an SMTP decision; administrators reset passwords instead.
- Editing a person's name or email from the ERP is not offered yet.
- The manager mobile app has no sign-in yet.
- Security test still to run: confirm the `erp-api-admin` service account cannot give itself Keycloak admin roles. The automated probe was blocked in this environment, so it needs owner approval. The ERP never calls role-mapping endpoints.

## 2026-11-25: AUTO360 UI/UX increment 1 (design system, shell, executive dashboard)

**Input:** docs/spec/AUTO360_UI_UX_MASTER_DESIGN.md (380 proposed views). Followed its start command: audit, catalog and contracts, design system, executive dashboard.

### Changes

- **Audit and traceability:**
  - `docs/SCREEN_CATALOG.md` lists all 380 views with requirement IDs, phase, status, route and evidence: 7 implemented, 6 partial, 2 shell only, 6 next, 289 planned, 70 postponed (the customer app, per owner decision).
  - `docs/SCREEN_CONTRACTS.md` has the implemented and partial screens.
  - Also added: `DESIGN_SYSTEM.md`, `KPI_DICTIONARY.md`, `NAVIGATION_MAP.md`, `COMPONENT_LIBRARY.md`, `USER_JOURNEYS.md`, `UI_ACCEPTANCE_CRITERIA.md`. Requirement traceability stays in `docs/TRACEABILITY.md`.
  - Conflicts with earlier decisions are recorded in `docs/DECISIONS.md`: customer app postponed, demo mode isolated and deferred, no dead search or notification buttons, password recovery needs an SMTP decision.
- **API:**
  - Migration `reporting_foundation` adds `accounting.account.reporting_class` (cash, bank, receivable, payable, inventory, cogs), with a DB check against the account type.
  - Adds the view `reporting.ledger_line`.
  - Gives existing company-admin roles the new `reports.financial.read` permission.
  - New `GET /companies/{id}/reports/financial-summary`: revenue, COGS, gross profit and margin, operating expenses, net profit, cash and bank, monthly trend, branch comparison and exceptions. All figures come from one REPEATABLE READ snapshot and use the central formulas (`kpi.ts`). Branch-limited users are restricted to their branches.
- **Design system:**
  - AUTO360 tokens for light and dark; semantic text is darkened to pass AA, and new contrast tests cover the sidebar and links.
  - Inter and IBM Plex Sans Arabic, self-hosted.
  - shadcn-style components (Radix, Lucide, cva, tailwind-merge).
  - Light, dark or system theme, kept in a cookie and applied before paint.
  - `groupDigits` adds exact thousands separators.
- **Shell:**
  - Sidebar 248/72 px, collapsible (remembered), turning into a drawer below 1024 px.
  - 64 px header with breadcrumbs, company switcher, language switch, and profile menu (theme, sign out).
- **WEB-001 Executive dashboard:**
  - Filters for month range, presets and branch, kept in the URL.
  - Six KPIs, an ECharts monthly trend, and a branch comparison; every chart has a data table.
  - "Needs attention" panel with links to the related records, and a freshness line.
- **Existing screens:**
  - Chart of accounts: reporting-class field and badge.
  - Amounts grouped everywhere.
  - Journal numbers and dates no longer wrap.

### Bugs found while verifying

- Chart Y axis showed "1, 1, 1, 0" for all-zero data. Fixed with whole-number ticks.
- **Arabic charts:** legend text overlapped its keys and axis labels went under the bars, because the SVG text inherited RTL. Fixed with `dir="ltr"` on the chart, a left-to-right time axis (T-28), and the legend at the reading edge.
- The cash card showed a stray "Reporting class" label when no cash accounts existed. It now says "Not set up — see 'Needs attention'".

### Commands run and results

| Command | Result |
|---|---|
| `pnpm install --frozen-lockfile`, `pnpm format:check` | ✅ |
| `pnpm turbo run build typecheck lint test --force` | ✅ 48/48 tasks; 170 unit tests (validation 55, api 50, web 23, localization 18, api-client 7, tokens 5, worker 5, web-ui 1, mobile 3+3) |
| Fresh DB: `db:migrate`, `db:migrate:check` | ✅ 3 migrations, "No difference detected" |
| API integration | ✅ 70/70, including 13 reporting tests against a hand-calculated fixture |
| Worker integration / smoke | ✅ 2/2, 11/11 |
| `pnpm test:e2e-web` | ✅ 21/21, including the dashboard check |
| Production image rebuilt and redeployed (migration ran automatically); `verify-deployment.mjs` | ✅ 14/14 |
| Screen capture on the production stack | ✅ 25 screens: desktop 1440, tablet 768, phone 390, Arabic, dark theme, collapsed sidebar |

### Not done or not verified

- No automated accessibility scan (axe) yet. The 380-view catalog is mostly planned work.
- The demo mode from the spec is not started (it needs phase 2–3 modules).
- The mobile apps have not been restyled with the AUTO360 tokens.
- Known minor issue: Jest warns that the Phase 0 health integration suite leaves a ~2 s Redis connect timer open. The run still exits 0.

## 2026-11-25: Web ERP sign-in and Phase 1 screens

**Requirement IDs:** P1-10 (web part), ACC-001, ACC-002, ACC-008, ADM-001 (partial), ADM-007, ADM-006, SEC-04 (web side).

### Changes

- **Web sign-in** (`apps/web-erp/src/lib/session*.ts`, `oidc.ts`, `app/session/*`):
  - Uses `openid-client` 6.9 with the `erp-web` Keycloak client: authorization code + PKCE S256 + state + nonce, and ID token validation.
  - Tokens are kept server-side, in a cookie that is encrypted (AES-256-GCM with an HKDF-derived key), httpOnly, SameSite=Lax, split into chunks, and Secure on HTTPS.
  - Access tokens refresh through `/session/refresh` for pages and in place for server actions.
  - Sign-out is POST-only, checks the Origin header, and also ends the Keycloak session (RP-initiated logout).
  - `returnTo` accepts same-site paths only (no open redirect).
- **Screens, in English and Arabic (RTL), responsive and keyboard/screen-reader friendly:**
  - Home: sign-in, company picker, system status.
  - New company (platform administrators).
  - Company overview, branches, and the chart of accounts (tree, header vs posting accounts).
  - Fiscal periods (create; close with a reason and optimistic version check).
  - Journals: list with cursor pagination, detail, and reversal with a reason. The new-journal form shows exact running totals in integer minor units and a balance indicator. An idempotency key per form means a double submit can never post twice.
  - Audit trail.
  - Every screen has empty and error states and shows the server's RFC 9457 detail. Actions are hidden without the permission, and the server still enforces it.
- **Shared code:**
  - `@erp/validation`: `toMinorUnits` / `formatMinorUnits` for exact money arithmetic, and `webEnvSchema`.
  - `@erp/api-client`: `unwrap` / `expectOk` helpers.
  - `@erp/contracts`: type aliases. 95 Arabic/English message keys added.
- **API contract fix:** company routes now declare the `companyId` path parameter in OpenAPI. It used to be missing because the permission guard resolves it, so typed clients could not supply it.
- **Shop server:**
  - Web gets OIDC settings and `WEB_SESSION_SECRET`.
  - `install.ps1` and `upgrade.ps1` add missing secrets to an existing `deploy/.env` and never change existing values (3 new PowerShell tests).
  - CI generates the new secret.
- **Backup bug fixed (found in testing).** After a Docker or PC restart, the backup service started before PostgreSQL accepted connections. It flagged a failure and then slept 6 hours while reporting unhealthy. It now waits up to 5 minutes for the database at start, and retries every 5 minutes after any failure.
- **Tests:**
  - `scripts/e2e-web.mjs` (`pnpm test:e2e-web`, added to CI with the dev Keycloak).
  - `deploy/scripts/keycloak-login.mjs`: a shared Keycloak sign-in helper that handles password change, TOTP enrolment and returning-user codes.
  - The deployment check now also signs in through the web app.
  - The smoke test gives the web app placeholder sign-in settings and checks that the sign-in link is offered.
- **Other:**
  - `apps/web-erp/turbo.json`: typecheck runs after the build, because it reads `.next/types`; the race was found in testing.
  - Table header alignment fixed.

### Bugs found while verifying

- **Forms sometimes stuck on "Saving…" after a successful save.** The server had committed the change and rendered the next page. With the company `loading.tsx`, Next.js 15.5 intermittently did not apply the redirect: about 1 in 4 runs, with server logs showing 201 then 200. Removing `loading.tsx` gave 4/4 clean runs (T-26). The ledger was never at risk, because posts are idempotent.
- **The backup service stayed unhealthy for up to 6 hours after a restart.** Fixed as described above.
- **Missing `companyId` in the OpenAPI contract.** Fixed as described above.

### Commands run and results (2026-11-25)

| Command | Result |
|---|---|
| `pnpm install --frozen-lockfile`, `pnpm format:check` | ✅ |
| `pnpm turbo run build typecheck lint test --force` | ✅ 48/48 tasks; 156 unit tests (validation 53, api 45, web-erp 23, localization 11, api-client 7, design-tokens 5, worker 5, web-ui 1, customer-mobile 3, manager-mobile 3) |
| Fresh database: `db:migrate`, `db:migrate:check` | ✅ "No difference detected" |
| API / worker integration | ✅ 57/57, 2/2 |
| `pnpm test:smoke` | ✅ 11/11 |
| `pnpm test:e2e-web` (dev Keycloak, real API and PostgreSQL) | ✅ 20/20, and 4 consecutive clean runs after the `loading.tsx` fix |
| Production image rebuilt; `docker compose -f deploy/docker-compose.prod.yml up --wait`; `verify-deployment.mjs` | ✅ 14/14 |
| Backup start-up drill (database down when the backup service starts, back after 20 s) | ✅ waited, then backed up; health ok |
| PowerShell helper tests (pwsh 7.4) | ✅ 12/12 |

The 20 browser checks:
1. Protected pages redirect to Keycloak with PKCE.
2. Sign-in with forced password change and TOTP enrolment.
3. The session cookie is httpOnly and SameSite=Lax, and not visible to page scripts.
4. Create a company.
5. Chart of accounts with a hierarchy.
6. A duplicate account code shows the server error.
7. Create periods.
8. The journal form shows exact totals, and the server rejects an unbalanced entry.
9. A balanced journal posts and shows its detail.
10. Reversal links both journals, and reversing twice is not offered.
11. The journal list shows both entries.
12. Closing a period makes later posts into it fail with a clear message.
13. Branches.
14. The audit trail shows the actions and the reason.
15. Six Arabic pages are RTL with no horizontal scroll at 390 px.
16. The language switch keeps the current page.
17. Sign-out ends both the ERP and the Keycloak session.
18. A cross-site sign-out request gets 403.
19. An open-redirect `returnTo` is refused.
20. No uncaught page errors.

The deployment check's new item: in a fresh browser on the production stack, sign-in with password plus one-time code reaches the ERP, with a Secure, httpOnly session cookie.

### Not done or not verified

- **Manager app sign-in and screens (L-06)**: next change.
- **No screens yet to create staff users or assign roles.** Today that means `add-admin.ps1` (administrators only) or the API. Next change.
- Not yet run on the real Windows PC or on real staff phones. GitHub Actions has not run.
- Automated accessibility scanning (axe) is not in place. Labels, landmarks, focus styles, keyboard flow and contrast were built in, and the browser test uses accessible names.
- API error details (for example "Journal is not balanced…") are in English only on Arabic pages.

### Next task

Manager app (Expo) sign-in with `erp-manager-mobile` (PKCE, SecureStore) and read-only journals and periods. Then web screens for staff users, roles and assignments, so the owner can onboard staff without scripts.

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
