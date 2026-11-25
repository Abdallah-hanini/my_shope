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
