# Automotive ERP — Master Development Specification

This consolidated document replaces the separate specification files. References to those files mean the corresponding named sections below. Maintain a separate STATUS.md during implementation. Read this entire document before beginning Phase 0.

## Contents

- CLAUDE.md
- README.md
- docs/BRD.md
- docs/SRS.md
- docs/ARCHITECTURE.md
- docs/DATA.md
- docs/ACCOUNTING.md
- docs/REPORTING.md
- docs/MOBILE.md
- docs/SECURITY_QA.md
- docs/ROADMAP.md
- STATUS.md
- START.md


---

## Source section: `CLAUDE.md`

# Automotive ERP — engineering charter
Build three mandatory clients: Next.js ERP, React Native Expo customer app and separate manager app. Use NestJS, PostgreSQL, Prisma plus reviewed SQL, Redis, BullMQ, pnpm and Turborepo. Read README and relevant docs before each task. Start with Phase 0 in docs/ROADMAP.md. Maintain STATUS.md and requirement traceability. Do not attempt all phases in one change.

## Non-negotiable rules
- PostgreSQL is authoritative; use decimal arithmetic, atomic transactions, constraints, idempotency and concurrency control for stock and money. Redis is never authoritative.
- Enforce company, branch, resource ownership and role permissions on the server. Never trust client-supplied scope or totals.
- Posted journals and stock movements are immutable; correct via reversal. No negative available stock or unbalanced journals. No self-approval of restricted transactions.
- No mock production functionality, hardcoded secrets, fake success, skipped tests or silent failures. Use synthetic development data only.
- Centralize KPI definitions and business rules; clients consume typed OpenAPI contracts. Reports reconcile to ledgers and show freshness.
- Arabic/English, RTL, accessibility, responsive web and native mobile experiences are mandatory.
- Ask for decisions on tax, payroll law, costing, payment providers and legal entity structure before enabling affected production features. Record assumptions in STATUS.md.
- Each task: inspect repository, plan, implement vertical slice, migrate safely, run relevant tests, review security and update status. Do not deploy, spend money or run destructive commands without approval.

---

## Source section: `README.md`

# Automotive ERP starter specification
This is a greenfield specification pack, not runnable application code. Extract into a new project directory, start Claude Code there, and paste START.md. Read CLAUDE.md and docs in order: BRD, SRS, ARCHITECTURE, DATA, ACCOUNTING, REPORTING, MOBILE, SECURITY_QA, ROADMAP. All targets are proposals until validated. Both mobile apps are required in the full release.

---

## Source section: `docs/BRD.md`

# Business requirements
BRD-01 Centralize mechanical workshop and parts retail/wholesale operations; multi-company, branch, warehouse and cost center capable.
BRD-02 Track every vehicle from booking/check-in to diagnosis, quotation, approval, repair, QC, payment, delivery and warranty.
BRD-03 Control inventory availability, cost, movements and purchasing; identify obsolete stock.
BRD-04 Maintain double-entry accounts, cash, bank, receivables, payables, payroll and actual job profitability.
BRD-05 Manage employees, attendance, payroll, productivity, suppliers, customers, contacts and fleets.
BRD-06 Provide customer mobile service booking, repair tracking, approvals, spare parts ecommerce and payment; manager mobile dashboards and approvals.
BRD-07 Provide auditable reporting, exception alerts and business controls across all clients.
Stakeholders: owner, general/branch/workshop managers, advisor, mechanic, QC inspector, storekeeper, procurement, cashier, salesperson, accountant, HR, CRM, auditor, administrator, customer. Owners see authorized consolidated results; employees see assigned scopes; customers see their own records only.
Discovery: jurisdiction, company separation, tax, payroll, costing method, opening balances, initial catalog, sales volumes, delivery terms, warranties, approval thresholds, payment and messaging vendors. Obtain sign-off from department owners before production.

---

## Source section: `docs/SRS.md`

# Functional specification
All requirements mandatory in full scope unless marked conditional. Expand each ID into user stories, API contracts and positive/negative acceptance cases before implementation.

## WMS
WMS-001: The system shall support Customer and vehicle registry.
WMS-002: The system shall support service scheduling and capacity.
WMS-003: The system shall support check-in inspection/photos.
WMS-004: The system shall support diagnostics and fault codes.
WMS-005: The system shall support versioned estimates and customer approval.
WMS-006: The system shall support job cards and assignments.
WMS-007: The system shall support labor time and costs.
WMS-008: The system shall support reserve/issue/return parts.
WMS-009: The system shall support additional approvals.
WMS-010: The system shall support repair status and ETA.
WMS-011: The system shall support QC/rework.
WMS-012: The system shall support invoice/delivery.
WMS-013: The system shall support service history/warranty.
WMS-014: The system shall support outsourced services and fleet jobs.

## INV
INV-001: The system shall support OEM/alternate/superseded numbers and barcodes.
INV-002: The system shall support fitment by make/model/year/engine.
INV-003: The system shall support genuine/aftermarket/used/refurbished.
INV-004: The system shall support retail/wholesale pricing.
INV-005: The system shall support warehouse/bin.
INV-006: The system shall support stock movements and reservations.
INV-007: The system shall support receipts/issues/transfers.
INV-008: The system shall support quarantine and condition inspection.
INV-009: The system shall support counts/adjustments with approval.
INV-010: The system shall support FIFO or weighted average policy.
INV-011: The system shall support landed cost.
INV-012: The system shall support low stock and aging.
INV-013: The system shall support serial tracking.
INV-014: The system shall support kits and special orders.

## PRC
PRC-001: The system shall support Supplier profiles and terms.
PRC-002: The system shall support requisitions.
PRC-003: The system shall support RFQ comparison.
PRC-004: The system shall support PO approvals.
PRC-005: The system shall support partial goods receipts.
PRC-006: The system shall support quality inspection.
PRC-007: The system shall support three-way matching.
PRC-008: The system shall support purchase returns.
PRC-009: The system shall support foreign currency and landed costs.
PRC-010: The system shall support supplier performance.

## POS
POS-001: The system shall support Quotes and orders.
POS-002: The system shall support barcode checkout.
POS-003: The system shall support cash/card/transfer/credit.
POS-004: The system shall support partial and split payments.
POS-005: The system shall support deposits.
POS-006: The system shall support credit limits.
POS-007: The system shall support discount/margin approvals.
POS-008: The system shall support returns/refunds.
POS-009: The system shall support cashier shifts and reconciliation.
POS-010: The system shall support receipts.
POS-011: The system shall support delivery.
POS-012: The system shall support commissions.

## ACC
ACC-001: The system shall support Chart of accounts.
ACC-002: The system shall support journals and GL.
ACC-003: The system shall support AR/AP.
ACC-004: The system shall support cash and bank.
ACC-005: The system shall support reconciliation.
ACC-006: The system shall support expenses/petty cash.
ACC-007: The system shall support fixed assets/depreciation.
ACC-008: The system shall support periods.
ACC-009: The system shall support cost centers.
ACC-010: The system shall support currency/tax.
ACC-011: The system shall support budgets.
ACC-012: The system shall support credit/debit notes.
ACC-013: The system shall support WIP.
ACC-014: The system shall support opening balances.
ACC-015: The system shall support accruals and prepayments.
ACC-016: The system shall support financial statements.
ACC-017: The system shall support intercompany policy.

## HR
HR-001: The system shall support Employee contracts and documents.
HR-002: The system shall support attendance and shifts.
HR-003: The system shall support leave.
HR-004: The system shall support overtime.
HR-005: The system shall support payroll allowances/deductions.
HR-006: The system shall support loans/advances.
HR-007: The system shall support commissions.
HR-008: The system shall support evaluations and technician productivity.
HR-009: The system shall support expiry alerts.
HR-010: The system shall support onboarding/offboarding.
HR-011: The system shall support end-of-service.
HR-012: The system shall support self-service.
HR-013: The system shall support payroll approvals.

## CRM
CRM-001: The system shall support Individual/corporate contacts.
CRM-002: The system shall support customer 360 and multiple vehicles.
CRM-003: The system shall support communications.
CRM-004: The system shall support leads/opportunities.
CRM-005: The system shall support followups.
CRM-006: The system shall support maintenance reminders.
CRM-007: The system shall support complaints and feedback.
CRM-008: The system shall support segmentation.
CRM-009: The system shall support loyalty/campaigns.
CRM-010: The system shall support consent.
CRM-011: The system shall support fleet contracts.
CRM-012: The system shall support outstanding reminders.

## QAS
QAS-001: The system shall support Inspection templates.
QAS-002: The system shall support mandatory QC and rework.
QAS-003: The system shall support warranty claims linked to original documents.
QAS-004: The system shall support root cause.
QAS-005: The system shall support supplier quality.
QAS-006: The system shall support equipment/tools.
QAS-007: The system shall support preventive maintenance/calibration.
QAS-008: The system shall support asset assignment.

## ADM
ADM-001: The system shall support Company/branch configuration.
ADM-002: The system shall support RBAC and scopes.
ADM-003: The system shall support approval matrix.
ADM-004: The system shall support feature flags.
ADM-005: The system shall support templates.
ADM-006: The system shall support bilingual RTL.
ADM-007: The system shall support audit.
ADM-008: The system shall support notification settings.
ADM-009: The system shall support import/export.
ADM-010: The system shall support global search.
ADM-011: The system shall support role-specific dashboard.

## State and acceptance rules
Job: draft -> approved -> assigned -> in progress -> QC -> ready -> delivered; failed QC -> rework; cancellation requires disposition of parts/deposits. Quote approval snapshots amount and revision. PO: draft -> approved -> sent -> partial/received -> closed; cancellation cannot erase receipts. Invoice: draft -> posted -> partially paid/paid; credit notes reverse posted amounts. Transfers: requested -> approved -> dispatched -> received, with in-transit accountability. Approval: pending -> approved/rejected/expired; version check and actor scope mandatory. All transitions server-enforced, audited and atomic where financial. Each module requires list/detail/search, validated inputs, permissions, error/loading/empty states, history and relevant reports. Refer to MOBILE and REPORTING for additional mandatory requirements.

---

## Source section: `docs/ARCHITECTURE.md`

# Architecture
API-first modular monolith, separate workers. apps/web-erp (Next.js), apps/api (NestJS), apps/customer-mobile and apps/manager-mobile (Expo), apps/worker; packages/contracts, api-client, validation, design-tokens, localization, web-ui, mobile-ui, config; infrastructure and tests.
Use REST /api/v1, OpenAPI-generated clients, RFC 9457-style errors, cursor pagination for large lists, explicit actions for state transitions. Zod/shared validation where suitable, TanStack Query, Zustand for local UI. Tailwind/shadcn, ECharts and AG Grid Community or TanStack Table; Victory Native mobile charts. OIDC provider to be selected. S3-compatible object storage with signed URLs and upload scanning. Sentry/OpenTelemetry; Prometheus/Grafana as needed.
Postgres schemas by domain, Prisma migrations with reviewed SQL constraints/indexes. Redis cache-aside with scoped keys, TTL and post-commit invalidation; separate queue Redis from evictable cache. Transactional outbox with unique event IDs, retries, deduplication and dead-letter handling. WebSocket or push updates are hints; reload authorized server state. No financial posting solely via unreliable async events. Keep critical stock and ledger changes in one transaction where applicable.
Local Docker Compose PostgreSQL/Redis; pin compatible dependency versions and commit lockfile. CI lint/typecheck/test/build/migration checks. Managed hosting later subject to budget and residency. No Kubernetes or microservices initially.

---

## Source section: `docs/DATA.md`

# Data model blueprint
Every scoped entity includes company_id and applicable branch_id; enforce composite references to prevent cross-company joins. UUID IDs, UTC timestamps, local business dates, version for optimistic locking. Currency ISO code, NUMERIC amounts (propose 20,6 for intermediate costs; currency-specific rounding at posting). Never use floats for money. Unique document number per company/type/series. Store historical prices, rates, tax and cost snapshots.
Entities: Company, Branch, Warehouse, Bin, CostCenter, User, Role, Permission, UserScope, Approval, Customer, Contact, Address, Vehicle, VehicleOwnerHistory, Appointment, JobCard, Estimate, EstimateRevision, JobTask, LaborEntry, JobPart, Inspection, WarrantyClaim, Product, Brand, Category, PartNumber, Fitment, Supplier, SupplierProduct, PurchaseOrder/Line, GoodsReceipt/Line, StockMovement, StockBalance, Reservation, CostLayer, Transfer, StockCount, SalesOrder/Line, Invoice/Line, Payment, PaymentAllocation, CreditNote, Account, Journal/Line, FiscalPeriod, BankStatement, Employee, Contract, Attendance, Leave, PayrollRun/Line, Lead, Opportunity, Activity, Complaint, Campaign, Asset, Notification, OutboxEvent, AuditEvent, ReportRun.
Relationships: customer has vehicles via ownership history; vehicle has jobs; job has estimates, tasks, parts, labor and inspections. Product has fitments and stock movements per warehouse/bin. Invoice lines reference sales/job sources; payment allocations join payments to invoices. Journal lines reference accounts and source document. Prevent deletion of referenced posted records.
Stock balance = sum posted movements; available = eligible on-hand minus active reservations; quarantine/damaged excluded. Incoming stock excluded until accepted. Lock affected stock/cost rows in deterministic order or use atomic conditional updates. Reconcile balance projection to movement ledger. Index company/branch/date, normalized SKU/OEM/barcode, foreign keys and report filters; pg_trgm for fuzzy search. Use fixtures for concurrency and cross-tenant isolation. Produce detailed ERD and migration review in Phase 1.

---

## Source section: `docs/ACCOUNTING.md`

# Accounting posting matrix
Illustrative accrual/perpetual inventory baseline; accountant must approve recognition, chart, costing, tax and payroll mappings before live use. Dr = debit; Cr = credit. Taxes omitted below; add configured effective-dated tax lines where applicable.
| Event | Dr | Cr |
|---|---|---|
| Accepted purchase receipt | Inventory | Goods received not invoiced |
| Matched supplier invoice | GRNI (plus approved variance) | Payables |
| Supplier payment | Payables | Bank |
| Retail invoice | Receivable | Sales revenue |
| Retail stock issue | COGS | Inventory |
| Workshop part consumption | WIP | Inventory |
| Recognized direct labor | WIP or labor expense per policy | Labor clearing |
| Workshop completion/invoice per recognition policy | Receivable | Service/parts revenue |
| Recognize job cost | COGS | WIP |
| Customer receipt | Cash/bank/clearing | Receivable |
| Customer deposit | Cash/bank | Customer advances |
| Apply deposit | Customer advances | Receivable |
| Credit note | Sales returns | Receivable/refund liability |
| Accepted resalable return | Inventory | COGS |
| Refund | Refund liability/customer credit | Cash/bank |
| Stock write-off | Inventory loss | Inventory |
| Payroll accrual | Payroll expense or approved allocation | Payroll liabilities |
| Payroll payment | Payroll liabilities | Bank |
| Depreciation | Depreciation expense | Accumulated depreciation |
Same legal entity transfer: no revenue; track in-transit stock; intercompany needs separate policy. Reservation has no journal. Avoid double recognition at invoicing/payment. Handle partial receipt/invoice, price variances, non-resalable returns, chargebacks, FX, rounding and reversals explicitly. Unique source/event posting key; balance in base currency; closed periods reject posting. Job gross profit = recognized revenue less recognized direct parts/labor/consumable/outsourced cost; overhead separately allocated if approved. Reconcile GL to inventory, receivables, payables, payroll and cash daily and at close.

---

## Source section: `docs/REPORTING.md`

# Reporting and BI (mandatory)
Use PostgreSQL reporting schema with canonical SQL views, summary tables and materialized views. Refresh via outbox/BullMQ with watermark, retry and reconciliation. Official financial reports read consistent posted data; label provisional data. Historical as-of reports use effective posting/movement dates, not current balances. Add read replica only when needed; display replication/freshness lag. Metabase optional self-service BI with read-only restricted views; enforce tenant isolation independently. ECharts web, native mobile charts; ExcelJS, CSV and Chromium PDF exports. Background large reports, expiring signed downloads and permission recheck at download. Scheduled reports must respect recipient scope.
Report catalog: P&L, balance sheet, cash flow, trial balance, GL, journal audit, AR/AP aging, bank reconciliation, cash closing, tax summary, budget variance, branch comparison, job profitability, job aging, WIP, bay utilization, technician productivity/efficiency, rework, warranty expense, stock valuation, stock movement, available/reserved, aging, dead stock, turnover, discrepancy, reorder, supplier lead time, purchase variance, landed cost, retail/wholesale/online sales, margin by SKU/category/brand, returns, discounts, salesperson commissions, payroll, attendance, overtime, leave, customer retention, complaints, fleet revenue, conversion and abandoned carts.
KPI dictionary: net revenue = recognized revenue less returns/discounts excluding tax; gross profit = net revenue minus COGS; gross margin = gross profit/net revenue (null when zero); net profit = recognized income less expenses; stock turnover = period COGS/average inventory value with explicit period; utilization = billable hours/available hours; first-time fix = eligible completed jobs without related rework within configured window / eligible jobs; AR aging uses residual balance and due date at cutoff. Define currency conversion and consolidation eliminations, timezone, filters, exclusions and denominator for each KPI.
RPT acceptance: permissions and branch/date/department filters; drill from KPI to invoice/job/journal; sort, group, pivot where supported, saved views, charts, comparisons, print and bilingual exports. Web and mobile same definitions. Test totals against independently calculated ledger fixtures, returns, partial payments, closed periods, zero denominators, timezones, cache freshness and export scope. Proposed KPI freshness 60s; ordinary reports p95 2s under agreed load.

---

## Source section: `docs/MOBILE.md`

# Mandatory native apps
Separate Expo apps, package IDs, navigation and release pipelines. Shared contracts/design tokens, not unrestricted shared permissions. Customer: registration/OTP, profile, vehicle VIN/manual registration, history/documents, service catalog, branch/slot booking, reschedule/cancel, photos, estimate revision approval, progress/ETA, inspection, warranty, compatible spare parts search, cart, checkout, pickup/delivery, order tracking/returns, deposits, invoice/payment receipts, loyalty, support, feedback, notifications and preferences. Manager: company/branch dashboards, financial KPIs and drill-down, jobs/technician assignments, inventory and procurement, expense/payment/refund/discount/credit/stock approvals, attendance/leave/overtime/payroll approvals, CRM complaints, alerts and delegated authority.
Customer flow: book -> diagnose -> approve exact quotation revision -> reserve parts -> repair -> QC -> invoice -> pay -> delivery -> feedback. Manager approval binds exact request version; reject stale requests, self-approval or unauthorized branch; step-up auth for sensitive actions. Payment via provider-hosted flow and verified webhook; client success screen is not proof of payment.
SecureStore tokens, OIDC PKCE, biometrics for local unlock, server-side step-up for sensitive operations, revoke sessions, no sensitive notification content. Offline read-only limited non-sensitive cached data, timestamp and stale label; no offline money/stock/approval mutations. Camera/barcode permissions, safe uploads, deep links with authorization, push token lifecycle, Arabic RTL, accessible touch targets, real-device tests. Apple/Google store accounts and privacy declarations required; supported OS versions to be agreed.

---

## Source section: `docs/SECURITY_QA.md`

# Security and quality gates
Threat model customer/employee separation, IDOR, privilege escalation, fraud, payment forgery, malicious uploads, queue replay and export leakage. Enforce RBAC plus resource/company/branch scope at service and query layer; MFA privileged accounts; maker-checker; rate limits; secure secrets; TLS; audit actor, scope, timestamp, reason and redacted before/after; no secrets or card data logs. OWASP ASVS/MASVS baseline; dependency and secret scans. Backups/PITR, restore drills, RPO 15m/RTO 2h proposed.
Tests: Jest unit, real Postgres integration, API contract, Playwright web, Maestro mobile, k6 load. P0 cases: concurrent last unit, duplicate payment webhook, partial receipt, stock transfer/return, cost layers, balanced posting/reversal, rollback on failure, inventory-GL tie-out, AR/AP aging, period close, job profit, payroll approval, cross-company access, stale approvals, refund, report drill-down/export equality, recovery. Test Arabic/English, accessibility, network loss and retry. No unresolved critical/high security or P0/P1 defects; all mandatory tests pass; UAT by business owners. Do not fabricate test evidence. Targets p95 standard API 300ms/transaction 500ms, 99.9% uptime, LCP p75 2.5s; agree data size and concurrency before claiming compliance.

---

## Source section: `docs/ROADMAP.md`

# Implementation backlog and gates
0. Foundation: monorepo, all three client shells, API, local DB/cache, CI, health checks. Gate builds and smoke tests.
1. Identity/org/accounting foundations: scoped roles, audit, chart, periods, transactional posting, master data and migrations. Gate isolation, balanced journals, reversals.
2. Catalog/inventory/procurement: fitment, stock ledger, reservations, costing, PO/GRN/matching/transfers/counts. Gate concurrent stock and GL reconciliation.
3. Sales/POS/workshop: checkout, payments, returns, vehicles, bookings, estimates, job cards, labor, QC, WIP, delivery/warranty. Gate full purchase-to-sale and repair-to-cash.
4. Customer mobile and ecommerce: implement native workflows incrementally alongside phases 2–3; gate booking, approval, stock and payment integration.
5. Manager mobile and reporting: implement alongside phases 1–4; dashboards, approvals, reporting schema, exports, alerts. Gate reconciled cross-platform totals and permissions.
6. HR/payroll/CRM/assets: implement configured policies, payroll posting, campaigns, fleet, equipment and maintenance. Gate approved payroll fixtures and privacy.
7. Hardening and release: migration rehearsals, load/security tests, restore, UAT, training, mobile store readiness, release rollback plan. Gate written approval; both apps mandatory.
For each phase create small tasks with ID, dependency, requirement mapping, acceptance tests, status. Do not mark complete until verified. Estimated schedule not committed. Keep production integrations disabled until credentials and policy approvals are available.

---

## Source section: `STATUS.md`

# Delivery status
Phase 0: not started. No code or tests executed.
Record date, requirement IDs, changes, commands, results, blockers, decisions and next task here.

---

## Source section: `START.md`

Read CLAUDE.md, README.md and all files in docs. Act as a senior product analyst, architect, full-stack engineer, mobile engineer, accounting systems engineer and QA lead. Inspect the repository first. Create a task plan and requirement traceability matrix. Identify blocking business decisions, but proceed with reversible local foundation work. Implement Phase 0 only: initialize pnpm/Turborepo, Next.js web, NestJS API, separate Expo customer and manager apps, shared packages, PostgreSQL and Redis local Docker Compose, migrations, environment examples, CI checks and health endpoints. Validate installs, builds, lint, typecheck and smoke tests. Update STATUS.md with actual commands and results; distinguish failures and untested items. Do not proceed to Phase 1 until the foundation gate passes and I approve. Never claim implementation is complete without evidence.
