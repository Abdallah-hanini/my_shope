# Screen contracts — implemented and partial screens

Contract fields per docs/spec/AUTO360_UI_UX_MASTER_DESIGN.md ("Screen patterns"). Planned screens get a contract when their increment starts. Every view must have:
- **States**: loading (server render), empty, error (RFC 9457 detail), forbidden (403 notice / 404 for foreign companies), success (server-confirmed data).
- **Responsive and RTL**: as in docs/DESIGN_SYSTEM.md.

## WEB-001 Executive overview
- **Route:** `/[locale]/c/[companyId]?from=YYYY-MM&to=YYYY-MM&branch=<uuid>`. The URL is shareable and holds no sensitive data.
- **Requirements:** REPORTING KPI dictionary, BRD-07, ADM-011 (role dashboard).
- **Persona:** owner, general manager, accountant (permission `reports.financial.read`).
- **Purpose:** financial health at a glance, from posted journals.
- **Layout:**
  - Page header with a freshness line.
  - Filter card: from and to month, branch, Apply, and presets (this month, last 3 months, this year, last 12 months).
  - Six KPI cards: revenue, gross profit with margin, operating expenses, net profit, cash and bank, journals posted.
  - 12-month trend chart with a data-table alternative, and a "Needs attention" panel.
  - Branch comparison chart with a table, shown when there are two or more groups.
- **Source:** `GET /api/v1/companies/{companyId}/reports/financial-summary`, aggregated from `reporting.ledger_line` (docs/KPI_DICTIONARY.md).
- **Actions:** filter, preset, drill to exceptions (open period → periods page, reversal → journal detail, unclassified cash → chart of accounts).
- **Permissions:** without `reports.financial.read`, the page shows area links instead. Branch-limited users see only their branches, with a notice.
- **Validation:** months must be `YYYY-MM`, with from ≤ to and at most 24 months (server). Invalid URL values fall back to the default range.
- **States:**
  - No revenue: margin shows "No revenue in this period", never 0%.
  - No cash or bank accounts classified: the cash KPI shows "—" and an exception explains why.
  - API failure: inline problem notice.
- **Responsive:** KPIs use 6, 3, 2 or 1 columns. Charts resize. The branch table scrolls horizontally inside its card on phones.
- **RTL:** layout mirrored. Charts keep a left-to-right time axis (T-28), and the legend starts at the reading edge.
- **Tests:**
  - `apps/api/test/reporting.int.test.ts` (13): hand-calculated fixture, branch and month reconciliation, scope, permission, zero revenue, exceptions, DB check.
  - `kpi.test.ts` (5).
  - e2e "Executive dashboard shows ledger-based KPIs and exceptions".

## WEB-099 Chart of accounts
- **Route:** `/[locale]/c/[id]/accounts`. **Requirement:** ACC-001. **Persona:** accountant.
- **Fields:** code, name, Arabic name, type, kind (posting or header), reporting class, parent header account.
- **Source:** `GET` and `POST /accounts`.
- **Permissions:** `accounting.account.read` / `.manage`.
- **Validation:**
  - Code format.
  - Parent must be a header account of the same type.
  - Reporting class must match the type and is allowed on posting accounts only (shared schema plus a DB check).
- **States:** empty guidance, duplicate code (409) shown at the form. **Tests:** e2e chart of accounts, duplicate code; API integration.

## WEB-101 Journal entries
- **Route:** `/[locale]/c/[id]/journals?cursor=`. **Requirement:** ACC-002.
- **Columns:** number, posting date, description, total (grouped digits), source and reversal state. Keyset pagination.
- **Branch-limited users** see only their branches (server filter). **Tests:** e2e list; API pagination and scope tests.

## WEB-102 Create journal voucher
- **Route:** `/[locale]/c/[id]/journals/new`. **Requirement:** ACC-002.
- **Fields:** posting date (default: today in the company time zone), description, branch (scope-filtered), lines (account, debit, credit, description; at least 2).
- **Behaviour:**
  - Exact running totals in minor units, with a balance indicator.
  - An Idempotency-Key per form, so a double submit never posts twice.
  - Server confirmation, then a redirect to the detail page.
- **Errors:** unbalanced, closed or missing period, header account, too many decimals; each shows the server detail.
- **Tests:** e2e unbalanced rejection and balanced posting; API concurrency and idempotency.

## WEB-103 Journal reversal
- **Location:** the journal detail page (reverse card). **Requirement:** ACC-002.
- **Fields:** posting date (not before the original) and reason.
- **Permission:** `accounting.journal.reverse`. The card is hidden for reversals and for journals already reversed.
- **Tests:** e2e reversal; API reversal, including the concurrent double reversal.

## WEB-010 Appointment calendar
- **Route:** `/[locale]/c/[id]/appointments?branch=&date=`. **Requirement:** WMS-002.
- **Behaviour:** a day view per branch in the company time zone. Each slot shows "x of y free" (or Full) and the appointments in it, and free future slots offer "+ Book". There are previous, today and next day links. When the hours are not set, a notice links to `/appointments/settings` (bays, slot length, hours per weekday; manage permission; version check).
- **Permission:** `workshop.job.read` to view; `workshop.job.manage` to book or change.
- **Tests:** appointments.int; e2e.

## WEB-011 Create service appointment
- **Routes:** `/[locale]/c/[id]/appointments/new?branch=&start=` and `/appointments/[id]`.
- **Fields:** vehicle, start, length, requested service, notes. The server refuses times outside hours or off the grid, past times, full bays and double bookings of a car.
- **Actions:** check in (opens a prefilled job card and links it), reschedule, cancel with a reason, and no-show after the start time.
- **Tests:** appointments.int; e2e.

## WEB-023 Labour time tracking
- **Locations:** the job card (Tasks table: actual hours, Clock on/Clock off, who is clocked on; "Labour time" card with the entries; "Enter missed time" panel), the job board banner "You are clocked on to …" with Clock off, and `/[locale]/c/[id]/labour-time`. **Requirement:** WMS-007.
- **Rules:** the server decides (T-62/T-63). The web only offers what the job card's flags allow (`canClockOn`, `myOpenEntryId`, `canStop`, `canVoid`, `canRecordTime`).
- **Report:** per technician, with the figures from KPI_DICTIONARY "Labour time", totals, "clocked on now" and the computed-at time. Needs `workshop.job.manage`.
- **Tests:** labour.int (7); e2e.

## WEB-025 Additional repair requests
- **Location:** the job card, "Additional work" card. **Requirement:** WMS-009.
- **Behaviour:**
  - Propose: what was found, plus up to 3 task rows in the form (the API accepts 20).
  - Each proposal shows its status, tasks, hours, who proposed it, and the decision (who authorised it and how, or the reason).
  - Managers record the customer's decision. The proposer or a manager can withdraw an open proposal.
  - Tasks from approved work are marked "(from additional work n)".
  - While a proposal is open, a note explains that the quality check waits, and "Send to quality check" is not offered.
- **Rules:** T-65, enforced by the server and the database.
- **Tests:** additions.int (7); e2e.

## WEB-126 Financial period closing (partial)
- **Route:** `/[locale]/c/[id]/periods`. **Requirement:** ACC-008.
- **Behaviour:** create a period; close it with a reason and an optimistic version check.
- **Gaps:** reopen needs the approval workflow (D-11); no close checklist yet.

## WEB-218 / WEB-220 Login and MFA
- **Route:** Keycloak realm `erp` through `/session/login` (PKCE, state, nonce). First sign-in forces a password change and TOTP enrolment for administrators. The Arabic login page is selected through `ui_locales`.
- **Tests:** e2e and the deployment check.

## WEB-221 User profile (partial)
- **Location:** header profile menu. Shows name and email, a theme choice (light, dark or system, kept in a cookie), and sign out (POST with an Origin check, which also ends the Keycloak session).

## WEB-222 / WEB-223 Company and branch configuration (partial)
- **Routes:** `/[locale]/companies/new` (platform admin) and `/[locale]/c/[id]/branches`. Create and list only; editing and deactivation are planned.

## WEB-100 General ledger
- **Route:** `/[locale]/c/[id]/ledger?account=&from=&to=&branch=&cursor=` (`accounting.journal.read`). API `GET /companies/{id}/reports/general-ledger`.
- **Shows:** account picker (posting accounts; needs `accounting.account.read`, otherwise a note), date range with presets, branch; summary tiles (opening, period debit, period credit, closing, line count); table with date, journal (link), description, debit, credit, running balance as "Dr"/"Cr". Opening row first; "Brought forward"/"Carried forward" on paged results (200 lines per page).
- **States:** no account chosen, no lines, header account (422 message), unknown account (404), branch-scope notice, freshness time.
- **Tests:** reporting.int (running balance, paging continuity, refusals, branch scope) and e2e drill-down.

## WEB-122 Trial balance
- **Route:** `/[locale]/c/[id]/trial-balance?from=&to=&branch=&zero=1` (`reports.financial.read`). API `GET /companies/{id}/reports/trial-balance`.
- **Shows:** chart order with header subtotals and indentation; opening, period debit, period credit, closing; "Total debits" and "Total credits" rows; balanced badge (or a red warning); period result with the dashboard formula; year-end note; freshness and currency.
- **Actions:** filters in the URL (shareable); each posting account opens its general ledger for the same range and branch.
- **Planned:** comparison column, CSV/Excel/PDF export through the export centre with audit (WEB-205).
- **Tests:** reporting.int (hand-calculated Q1, carry-forward, header roll-up, zero accounts, branch TB, reconciliation with the dashboard) and e2e.

## WEB-205 Export centre
- **Route:** `/[locale]/c/[id]/exports` (shown with `reports.financial.read` or `accounting.journal.read`). API `POST/GET /companies/{id}/exports`, `GET /exports/{id}`, `GET /exports/{id}/download`.
- **Request:** from the centre (report, dates, branch, account for the general ledger, CSV or Excel, file language) or with "Export" on the trial balance and general ledger pages, which exports exactly the filters on screen. Only report kinds the role allows are offered; the server checks again.
- **List:** the caller's own exports, newest first: report and filters, status (waiting, preparing, ready, failed with reason, expired), requested time, rows, size, available-until, Download. The page refreshes itself while an export is being prepared.
- **Files:** CSV is the table only (UTF-8 with BOM, CRLF, formula-safe). Excel has the table (frozen header, filter, number formats, right-to-left in Arabic, bold headers and totals) and an "About" sheet: report, company, period, branch, scope, currency, generated at and by, source; for the trial balance also "balanced" and the period result.
- **Security:** requester-only (others get 404); permission and branch coverage rechecked at download (403); expired 410; every request and download audited; at most 3 in progress (429).
- **PDF:** Print → Save as PDF on the report page (print styles; T-43).
- **Tests:** exports.int (14: file equals screen for all three kinds, Arabic Excel, GL paging, branch scope, isolation, recheck, failure, limits, expiry, DB checks, audit, real queue) and e2e.

## Shell: notification inbox
- **Route:** `/[locale]/c/[id]/notifications?filter=unread&cursor=` (any member; own messages only). API `GET /companies/{id}/notifications`, `GET …/unread-count`, `POST …/{id}/read`, `POST …/read-all`.
- **Bell:** in the header on company pages; unread count in a badge and in the accessible name ("Notifications: 2 unread"). It is fetched in the browser through `/notifications/count` and refreshed on navigation, every 30 s while the tab is visible, and immediately after changes in the inbox. If the count cannot be fetched, no number is shown.
- **Inbox:** newest first, 20 per page with "Older"; unread messages highlighted (and announced as "Unread" to screen readers); time in the company time zone. "Open" marks the message read and goes to its record (only paths inside the company); "Mark as read" for messages without a link; "Mark all as read".
- **Messages (T-48):** journal reversed, role given, removed or changed, period closed, export ready or failed, in the reader's language with neutral wording when a name is missing.
- **Tests:** notifications.int (14: each rule, self-actions and invisible records excluded, replay without duplicates, unknown events, retry and dead-letter with health report, housekeeping, link check, inbox paging, filters, read state, isolation, real background delivery) and e2e (bell, inbox, open, mark all read, staff inbox text).

## WEB-237 Global search
- **Route:** `/[locale]/c/[id]/search?q=` (any member). API `GET /companies/{id}/search?q=&limit=`.
- **Entry:** header search box on screens ≥ 1024 px (`/` or Ctrl/⌘+K focuses it); a search icon on smaller screens. A plain GET form that works without JavaScript.
- **Shows:** one card per record type with matches, with counts ("20+" when more exist). Each hit shows its code or number, name (Arabic name in Arabic), and context: journal date, total and reversal badge; account type or header; period dates and status; person email and deactivated badge. Exact-spelling matches are highlighted.
- **Links:** journal → detail; posting account → general ledger (or the chart of accounts without journal access); branch → branches; period → periods; person → profile.
- **Rules:** 2–100 characters; "contains" match; Arabic spelling variants unified; `%` and `_` matched literally. Only types the role can read, with branch scope (T-40).
- **States:** empty query (autofocus), too short, no results, API error.
- **Tests:** search.int (8) and e2e.

## WEB-224 User management
- **Routes:** `/[locale]/c/[id]/users` and `/users/[userId]`. Needs `iam.assignment.read`; adding, resetting and deactivating need `iam.user.manage`; giving and removing roles need `iam.assignment.manage`.
- **API:** `GET/POST /companies/{id}/users`, `GET /users/{userId}`, `POST /users/{userId}/reset-password`, `POST /users/{userId}/status`, `POST/DELETE /role-assignments`.
- **Shows:** name, email, roles with branch, status, badges (you, platform administrator, also in another company). Add staff: first and last name, username, email, role, branch (or all branches if the admin is company-wide), language, authenticator required (default on).
- **States:** the temporary password is shown once with a copy button and is not shown again after reload. Server errors (duplicate username 409, escalation 403, identity server unavailable 503) appear above the form. Your own profile shows a note instead of account actions.
- **Tests:** staff.int (22) and e2e (add, sign in as staff, give/remove role, deactivate).

## WEB-225 Role management
- **Routes:** `/[locale]/c/[id]/roles` and `/roles/[roleId]`. Needs `iam.role.read`; changes need `iam.role.manage`.
- **Behaviour:** permissions as grouped checkboxes with English or Arabic labels and the code. Saving sends the version; a concurrent change answers 409. System roles are read-only. Delete appears only when nobody holds the role. Only permissions the admin holds company-wide can be granted.

## WEB-226 Permission matrix
- **Route:** `/[locale]/c/[id]/permissions` (`iam.role.read`). Read-only: roles as columns, grouped permissions as rows, with a sticky first column. Each cell is labelled "Granted" or "Not granted" for screen readers.

## WEB-231 Audit logs (partial)
- **Route:** `/[locale]/c/[id]/audit`.
- **Shows:** time in the company time zone, action, record, user, reason. Keyset pagination; branch-limited users see only their branches.
- **Planned:** filters by action, user and date.

## WEB-236 System health (partial)
- **Location:** home page status panel for API, database, cache and queue, with a last-checked time.
