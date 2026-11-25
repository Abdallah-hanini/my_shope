# Requirement traceability matrix

Maps every requirement ID in docs/SRS.md and docs/BRD.md, plus architecture and non-functional items introduced by this repository, to its roadmap phase, status and evidence. "Done (verified)" means the evidence column points at code plus a test or command that was actually run (see STATUS.md). Nothing is marked done on code alone.

Phases follow docs/ROADMAP.md: 0 foundation · 1 identity/org/accounting · 2 catalog/inventory/procurement · 3 sales/POS/workshop · 4 customer mobile · 5 manager mobile & reporting · 6 HR/payroll/CRM/assets · 7 hardening.

## Foundation, architecture and non-functional

| ID | Requirement | Source | Phase | Status | Evidence |
|---|---|---|---|---|---|
| ARCH-01 | Monorepo: pnpm + Turborepo, apps/ and packages/ layout | ARCHITECTURE | 0 | Done (verified) | `package.json`, `pnpm-workspace.yaml`, `turbo.json`; `pnpm build` 12/12 |
| ARCH-02 | Next.js ERP web client shell | ARCHITECTURE, CLAUDE | 0 | Done (verified) | `apps/web-erp`; `next build`; smoke checks |
| ARCH-03 | NestJS API, REST /api/v1, RFC 9457 errors | ARCHITECTURE | 0 | Done (verified) | `apps/api`; problem-details tests; integration 404 test |
| ARCH-04 | Separate Expo customer and manager apps (own package IDs, navigation, pipelines) | MOBILE, CLAUDE | 0 | Shell done; device/store pipeline not started | `apps/customer-mobile`, `apps/manager-mobile`; jest-expo tests; `expo export` android+ios |
| ARCH-05 | Separate worker process (BullMQ) | ARCHITECTURE | 0 | Done (verified) | `apps/worker`; unit + integration tests; smoke readiness |
| ARCH-06 | OpenAPI-generated typed contracts consumed by clients | ARCHITECTURE, CLAUDE | 0 | Done (verified) | `packages/contracts`, `packages/api-client`; `pnpm contracts:check` |
| ARCH-07 | Shared packages: validation, design-tokens, localization, web-ui, mobile-ui, config | ARCHITECTURE | 0 | Done (verified) | `packages/*` |
| ARCH-08 | Local Docker Compose PostgreSQL + Redis; queue Redis separate from evictable cache | ARCHITECTURE | 0 | Done (verified) | `docker-compose.yml` (allkeys-lru cache vs noeviction+AOF queue) |
| ARCH-09 | Prisma migrations with reviewed SQL; drift check | ARCHITECTURE, DATA | 0 | Done (verified) | `apps/api/prisma/migrations/20261125000000_foundation`; `pnpm db:migrate:check` |
| ARCH-10 | CI: lint/typecheck/test/build/migration checks | ARCHITECTURE | 0 | Written; not executed on GitHub | `.github/workflows/erp-ci.yml` (same commands run locally) |
| ARCH-11 | Health checks (API live/ready, worker, web) | ROADMAP | 0 | Done (verified) | `/api/v1/health/{live,ready}`, worker `:4100/health/*`, web `/healthz` |
| ARCH-12 | Pinned dependency versions and committed lockfile | ARCHITECTURE | 0 | Done | `save-exact`, `pnpm-lock.yaml` |
| SEC-01 | No hardcoded secrets; env validated at startup without echoing values | CLAUDE, SECURITY_QA | 0 | Done (verified) | `packages/validation` tests; `.env.example` only |
| SEC-02 | Security headers; no internals in error responses; log redaction of auth headers/cookies | SECURITY_QA | 0 | Done (verified) | helmet, ProblemDetailsFilter tests, pino redact |
| SEC-03 | RBAC + company/branch scope at service and query layer | SECURITY_QA, CLAUDE | 1 | Done (verified) | `apps/api/src/authz/*`; 404 for foreign company, 403 for missing permission, branch-filtered queries; scope.test.ts + phase1 integration |
| SEC-04 | OIDC provider (PKCE on mobile, SecureStore tokens) | ARCHITECTURE, MOBILE | 1 | API side done (provider-agnostic JWT/JWKS verification); provider choice D-03 and client sign-in pending | `apps/api/src/auth/*`; 7 auth integration tests |
| SEC-05 | Audit trail: actor, scope, timestamp, reason, redacted before/after; append-only | SECURITY_QA, ADM-007 | 1 | Done (verified) | `platform.audit_event` + immutability trigger; audit.test.ts; integration |
| SEC-06 | No privilege escalation when granting/revoking roles | SECURITY_QA | 1 | Done (verified) | `canDelegate`; integration escalation tests |
| ARCH-13 | Transactional outbox (write side) | ARCHITECTURE | 1 | Write side done; relay P1-11 pending | `platform.outbox_event`, `enqueueOutbox` |
| UX-01 | WCAG contrast and 44pt touch targets in shared tokens | CLAUDE, MOBILE | 0 | Done (verified) | `packages/design-tokens` contrast tests |
| UX-02 | Responsive web (no horizontal scroll at phone width) | CLAUDE | 0 | Done for shell | smoke: 390px viewport en/ar |
| RPT-* | Reporting schema, KPI dictionary, exports | REPORTING | 5 | Schema `reporting` created; rest not started | foundation migration |
| MOB-C | Customer app workflows (booking, approvals, ecommerce, payment) | MOBILE | 4 | Not started | — |
| MOB-M | Manager app workflows (dashboards, approvals) | MOBILE | 5 | Not started | — |

## Business requirements

| ID | Phase | Status |
|---|---|---|
| BRD-01 | 3 (multi-company structure from 1) | Not started |
| BRD-02 | 3 | Not started |
| BRD-03 | 2 | Not started |
| BRD-04 | 1–3, 6 | Not started |
| BRD-05 | 6 | Not started |
| BRD-06 | 4–5 | Not started |
| BRD-07 | 1 (audit), 5 (reporting) | Not started |

## Functional requirements (SRS)

Each ID still needs user stories, API contracts and positive/negative acceptance cases before its phase starts (SRS preamble).

| ID | Capability | Phase | Status | Evidence |
|---|---|---|---|---|
| WMS-001 | Customer and vehicle registry | 3 | Not started | — |
| WMS-002 | Service scheduling and capacity | 3 | Not started | — |
| WMS-003 | Check-in inspection/photos | 3 | Not started | — |
| WMS-004 | Diagnostics and fault codes | 3 | Not started | — |
| WMS-005 | Versioned estimates and customer approval | 3 | Not started | — |
| WMS-006 | Job cards and assignments | 3 | Not started | — |
| WMS-007 | Labor time and costs | 3 | Not started | — |
| WMS-008 | Reserve/issue/return parts | 3 | Not started | — |
| WMS-009 | Additional approvals | 3 | Not started | — |
| WMS-010 | Repair status and ETA | 3 | Not started | — |
| WMS-011 | QC/rework | 3 | Not started | — |
| WMS-012 | Invoice/delivery | 3 | Not started | — |
| WMS-013 | Service history/warranty | 3 | Not started | — |
| WMS-014 | Outsourced services and fleet jobs | 3 | Not started | — |
| INV-001 | OEM/alternate/superseded numbers and barcodes | 2 | Not started | — |
| INV-002 | Fitment by make/model/year/engine | 2 | Not started | — |
| INV-003 | Genuine/aftermarket/used/refurbished | 2 | Not started | — |
| INV-004 | Retail/wholesale pricing | 2 | Not started | — |
| INV-005 | Warehouse/bin | 2 | Not started | — |
| INV-006 | Stock movements and reservations | 2 | Not started | — |
| INV-007 | Receipts/issues/transfers | 2 | Not started | — |
| INV-008 | Quarantine and condition inspection | 2 | Not started | — |
| INV-009 | Counts/adjustments with approval | 2 | Not started | — |
| INV-010 | FIFO or weighted average policy | 2 (blocked: costing decision) | Not started | — |
| INV-011 | Landed cost | 2 | Not started | — |
| INV-012 | Low stock and aging | 2 | Not started | — |
| INV-013 | Serial tracking | 2 | Not started | — |
| INV-014 | Kits and special orders | 2 | Not started | — |
| PRC-001 | Supplier profiles and terms | 2 | Not started | — |
| PRC-002 | Requisitions | 2 | Not started | — |
| PRC-003 | RFQ comparison | 2 | Not started | — |
| PRC-004 | PO approvals | 2 | Not started | — |
| PRC-005 | Partial goods receipts | 2 | Not started | — |
| PRC-006 | Quality inspection | 2 | Not started | — |
| PRC-007 | Three-way matching | 2 | Not started | — |
| PRC-008 | Purchase returns | 2 | Not started | — |
| PRC-009 | Foreign currency and landed costs | 2 | Not started | — |
| PRC-010 | Supplier performance | 2 | Not started | — |
| POS-001 | Quotes and orders | 3 | Not started | — |
| POS-002 | Barcode checkout | 3 | Not started | — |
| POS-003 | Cash/card/transfer/credit | 3 (blocked: payment provider) | Not started | — |
| POS-004 | Partial and split payments | 3 | Not started | — |
| POS-005 | Deposits | 3 | Not started | — |
| POS-006 | Credit limits | 3 | Not started | — |
| POS-007 | Discount/margin approvals | 3 | Not started | — |
| POS-008 | Returns/refunds | 3 | Not started | — |
| POS-009 | Cashier shifts and reconciliation | 3 | Not started | — |
| POS-010 | Receipts | 3 | Not started | — |
| POS-011 | Delivery | 3 | Not started | — |
| POS-012 | Commissions | 3 | Not started | — |
| ACC-001 | Chart of accounts | 1 | Done (API, verified) | Hierarchy, header vs posting, type consistency; no template (D-04); `accounting.account`; integration |
| ACC-002 | Journals and GL | 1 | Done (API, verified) | Balanced, immutable, idempotent, gapless-numbered journals and reversal; DB-enforced; journal.service.ts + migration triggers; integration incl. concurrency |
| ACC-003 | AR/AP | 1–3 | Not started | — |
| ACC-004 | Cash and bank | 1–3 | Not started | — |
| ACC-005 | Reconciliation | 3 | Not started | — |
| ACC-006 | Expenses/petty cash | 3 | Not started | — |
| ACC-007 | Fixed assets/depreciation | 6 | Not started | — |
| ACC-008 | Periods | 1 | Done (API, verified) | Non-overlapping periods, close with optimistic lock + row lock; reopen blocked pending approvals; integration incl. lock test |
| ACC-009 | Cost centers | 1 | Not started | — |
| ACC-010 | Currency/tax | 1 (blocked: tax decision) | Not started | — |
| ACC-011 | Budgets | 5 | Not started | — |
| ACC-012 | Credit/debit notes | 3 | Not started | — |
| ACC-013 | WIP | 3 | Not started | — |
| ACC-014 | Opening balances | 1 | Not started | — |
| ACC-015 | Accruals and prepayments | 1 | Not started | — |
| ACC-016 | Financial statements | 5 | Not started | — |
| ACC-017 | Intercompany policy | 1 (blocked: entity structure) | Not started | — |
| HR-001 | Employee contracts and documents | 6 | Not started | — |
| HR-002 | Attendance and shifts | 6 | Not started | — |
| HR-003 | Leave | 6 | Not started | — |
| HR-004 | Overtime | 6 | Not started | — |
| HR-005 | Payroll allowances/deductions | 6 (blocked: payroll law) | Not started | — |
| HR-006 | Loans/advances | 6 | Not started | — |
| HR-007 | Commissions | 6 | Not started | — |
| HR-008 | Evaluations and technician productivity | 6 | Not started | — |
| HR-009 | Expiry alerts | 6 | Not started | — |
| HR-010 | Onboarding/offboarding | 6 | Not started | — |
| HR-011 | End-of-service | 6 (blocked: payroll law) | Not started | — |
| HR-012 | Self-service | 6 | Not started | — |
| HR-013 | Payroll approvals | 6 | Not started | — |
| CRM-001 | Individual/corporate contacts | 6 | Not started | — |
| CRM-002 | Customer 360 and multiple vehicles | 6 | Not started | — |
| CRM-003 | Communications | 6 (blocked: messaging vendor) | Not started | — |
| CRM-004 | Leads/opportunities | 6 | Not started | — |
| CRM-005 | Followups | 6 | Not started | — |
| CRM-006 | Maintenance reminders | 6 | Not started | — |
| CRM-007 | Complaints and feedback | 6 | Not started | — |
| CRM-008 | Segmentation | 6 | Not started | — |
| CRM-009 | Loyalty/campaigns | 6 | Not started | — |
| CRM-010 | Consent | 6 (blocked: privacy/consent policy) | Not started | — |
| CRM-011 | Fleet contracts | 6 | Not started | — |
| CRM-012 | Outstanding reminders | 6 | Not started | — |
| QAS-001 | Inspection templates | 3 | Not started | — |
| QAS-002 | Mandatory QC and rework | 3 | Not started | — |
| QAS-003 | Warranty claims linked to original documents | 3 | Not started | — |
| QAS-004 | Root cause | 3 | Not started | — |
| QAS-005 | Supplier quality | 3 | Not started | — |
| QAS-006 | Equipment/tools | 6 | Not started | — |
| QAS-007 | Preventive maintenance/calibration | 6 | Not started | — |
| QAS-008 | Asset assignment | 6 | Not started | — |
| ADM-001 | Company/branch configuration | 1 | Partial | Company and branch create/list with audit; update/deactivate pending; `apps/api/src/org/*`; integration |
| ADM-002 | RBAC and scopes | 1 | Done (API, verified) | Roles, company/branch scoped assignments, permission guard; `apps/api/src/authz`, `iam`; integration |
| ADM-003 | Approval matrix | 1 | Not started | — |
| ADM-004 | Feature flags | 1 | Not started | — |
| ADM-005 | Templates | 5 | Not started | — |
| ADM-006 | Bilingual RTL | 0 → all | Partial (foundation) | `packages/localization` (en/ar catalogs, RTL), `[locale]` routing in web-erp, mobile locale toggle; tests: localization.test.ts, locale.test.ts, HomeScreen.test.tsx, smoke RTL checks |
| ADM-007 | Audit | 1 | Done (API, verified) | Append-only audit with redaction, list API with branch filter; `platform.audit_event`; integration |
| ADM-008 | Notification settings | 5 | Not started | — |
| ADM-009 | Import/export | 5 | Not started | — |
| ADM-010 | Global search | 2 | Not started | — |
| ADM-011 | Role-specific dashboard | 5 | Not started | — |
