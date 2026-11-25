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

## WEB-231 Audit logs (partial)
- **Route:** `/[locale]/c/[id]/audit`.
- **Shows:** time in the company time zone, action, record, user, reason. Keyset pagination; branch-limited users see only their branches.
- **Planned:** filters by action, user and date.

## WEB-236 System health (partial)
- **Location:** home page status panel for API, database, cache and queue, with a last-checked time.
