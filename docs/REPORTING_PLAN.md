# Reporting and dashboards: architecture, coverage and tracker

The owner asked for a complete reporting and BI module (2026-12-01). Per the charter it is delivered in reviewed parts. This file is the architecture, the coverage matrix (module → reports, from the data the system actually records), the report catalog and the implementation tracker. Formulas are in docs/KPI_DICTIONARY.md.

## 1. Architecture

```
business modules (workshop, billing, inventory, purchasing, accounting)
  └─ PostgreSQL: posted documents + immutable journals
       └─ reporting.ledger_line (view: every posted journal line with account class)
            └─ API reporting layer (apps/api/src/reporting)
                 ├─ kpi.ts, aging.ts      pure formulas (unit-tested, exact decimals)
                 ├─ reporting.service     executive summary
                 ├─ ledger.service        trial balance, general ledger
                 ├─ statements.service    P&L, balance sheet, AR/AP aging
                 ├─ report-scope.ts       branch scope shared by every report
                 └─ exports (BullMQ)      Excel / CSV / PDF files, permission rechecked at download
                      └─ web: /reports catalog, report pages, dashboard, print
```

- **Single source of truth:** financial figures come only from posted journals; document reports (aging) use posted documents filtered by the posting dates of their journals, then reconcile to the ledger control account. Nothing is estimated or cached as a separate truth.
- **Consistency:** each report is read in one repeatable-read transaction and states when it was read ("Live: computed from posted journals at …").
- **Security:** every report endpoint requires a permission (`reports.financial.read`, `inventory.read`, `purchasing.read`, `workshop.job.*`) and applies the caller's branch scope on the server; an explicit branch outside the scope is refused (403). The catalog hides what a person cannot open; the server checks again.
- **Performance:** aggregation runs in SQL with the existing indexes on journal lines (company, account, date). Redis caching and materialized views are deliberately not added yet: the shop's volume is small, and a cache would add a second source to keep fresh. Revisit when a report's p95 exceeds 2 s (docs/REPORTING.md target).
- **Exports:** large files go through the existing background export queue; the same services build the screen and the file, so they cannot disagree.

## 2. Coverage matrix

Status: ✅ built and tested · ◐ partly · ☐ planned (data exists) · — not applicable yet (the system does not record the data; nothing will be invented).

| Module | Report / KPI | Status | Source |
|---|---|---|---|
| Finance | Executive dashboard (revenue, gross/net profit, opex, cash, branches, monthly trend, exceptions) | ✅ | ledger |
| Finance | Profit and loss with previous-period comparison, drill to ledger | ✅ R1 | ledger |
| Finance | Balance sheet at a date, balance check | ✅ R1 | ledger |
| Finance | Trial balance, general ledger, exports | ✅ | ledger |
| Finance | Receivables aging, reconciled | ✅ R1 | invoices, payments, credit notes |
| Finance | Payables aging, reconciled | ✅ R1 | supplier bills, payments, cancellations |
| Finance | Cash flow (direct, from cash/bank lines by source), opening to closing | ✅ R2b | ledger + journal source |
| Finance | Tax summary (output on invoices, input on bills, by code), checked to the tax accounts | ✅ R2b | invoices, supplier bills, ledger |
| Finance | Budget vs actual | — | no budgets are recorded |
| Sales | Revenue by labour vs parts, by branch and month, average invoice, discounts, credit notes, reconciled to ledger revenue | ✅ R2a | invoices, their journals |
| Sales | Best-selling parts and services | ✅ R2a | invoice lines |
| Sales | Sales targets | — | no targets are recorded (R3: owner-set targets) |
| Inventory | Stock value by part and branch, reconciled | ✅ | stock, ledger |
| Inventory | Movements, special orders, transfers | ✅ | movements |
| Inventory | Stock flow per part, fast / slow / dead stock, turnover, reconciled to the inventory account | ✅ R2a | movements |
| Inventory | Low stock / reorder recommendations | — | no reorder levels yet (R3 adds them) |
| Purchasing | Supplier bills, payables reconciliation | ✅ | bills |
| Purchasing | Supplier performance (price variance, special-order lead time) | ☐ R3 | bills, job parts |
| CRM | Customers: total, new, active, returning, top customers (balances: receivables aging) | ✅ R2a | customers, invoices |
| CRM | Satisfaction, segmentation | — | not recorded |
| Operations | Jobs opened / delivered, time to deliver, first-time right, open and overdue now, by branch | ✅ R2a | job cards |
| Operations | Technician hours and efficiency | ✅ | labour time |
| HR | Headcount, attendance, payroll, leave | — | HR and payroll are not built (needs the owner's payroll-law decisions) |
| Alerts | Overdue payables/receivables, low margin, reconciliation breaks | ☐ R3 | reports above + notifications |
| Personalisation | Saved filters, favourite reports, personal dashboards, scheduled e-mail | ☐ R3 | needs a configured mail server for e-mail delivery |

## 3. Report catalog (as shown at /reports)

| Area | Report | Route | Permission |
|---|---|---|---|
| Finance | Executive dashboard | `/c/[id]` | reports.financial.read |
| Finance | Profit and loss | `/reports/profit-and-loss` | reports.financial.read |
| Finance | Balance sheet | `/reports/balance-sheet` | reports.financial.read |
| Finance | Trial balance | `/trial-balance` | reports.financial.read |
| Finance | General ledger | `/ledger` | accounting.journal.read |
| Finance | Receivables aging | `/reports/receivables` | reports.financial.read |
| Finance | Payables aging | `/reports/payables` | reports.financial.read |
| Finance | Cash flow, tax summary | `/reports/cash-flow`, `/reports/tax` | reports.financial.read |
| Finance | Export centre | `/exports` | reports.financial.read |
| Inventory | Stock value, special orders, transfers | `/stock`, `/special-orders`, `/transfers` | inventory.read |
| Purchasing | Supplier bills | `/supplier-bills` | purchasing.read |
| Workshop | Labour time, appointments | `/labour-time`, `/appointments` | workshop.job.manage / read |
| Workshop | Workshop operations | `/reports/operations` | workshop.job.read |
| Sales | Sales, customers | `/reports/sales`, `/reports/customers` | reports.financial.read |
| Inventory | Stock movement | `/reports/stock-movement` | inventory.read |

## 4. Tracker

| Part | Scope | Status |
|---|---|---|
| R1 | Audit, architecture, coverage matrix, catalog page; P&L, balance sheet, receivables and payables aging (API, pages, print, drill-down, reconciliation); tests | ✅ |
| R2a | Sales, operations, customers and stock-movement reports (API, pages, catalog, tests) | ✅ |
| R2b1 | Cash flow and tax summary (API, pages, tests) | ✅ |
| R2b2 | Excel/CSV downloads for the new reports, from each report's header (PDF: print on every report) | ✅ |
| R3 | Owner-set targets and reorder levels; alerts; saved filters and favourites; personal dashboards; scheduled reports (needs mail settings) | ☐ |
