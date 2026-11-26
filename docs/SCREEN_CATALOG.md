# Screen catalog (AUTO360)

Generated from docs/spec/AUTO360_UI_UX_MASTER_DESIGN.md. Every one of the 380 proposed views is listed with its module, requirement IDs, roadmap phase and status. **Implemented** means code plus an automated test (evidence column). **Next** means it is scheduled for the next increments. **Planned** means it depends on modules or decisions that do not exist yet. Full contracts for implemented screens are in [SCREEN_CONTRACTS.md](SCREEN_CONTRACTS.md).

Counts are summarised at the end.

## Web — Executive

| ID | View | Requirements | Phase | Status | Route / location | Evidence |
|---|---|---|---|---|---|---|
| WEB-001 | Executive overview | REPORTING KPIs, BRD-07 | 5 (early) | Implemented | /[locale]/c/[id] | e2e "Executive dashboard…"; reporting.int.test.ts (13) |
| WEB-002 | Business performance comparison | REPORTING, BRD-07 | 5 | Planned | — | — |
| WEB-003 | Branch performance | REPORTING, BRD-07 | 5 | Planned | — | — |
| WEB-004 | Revenue and profitability analysis | REPORTING, BRD-07 | 5 | Planned | — | — |
| WEB-005 | Operational KPI dashboard | REPORTING, BRD-07 | 5 | Planned | — | — |
| WEB-006 | Business alerts center | REPORTING, BRD-07 | 5 | Planned | — | — |
| WEB-007 | Executive approval center | REPORTING, BRD-07 | 5 | Planned | — | — |

## Web — Workshop

| ID | View | Requirements | Phase | Status | Route / location | Evidence |
|---|---|---|---|---|---|---|
| WEB-008 | Workshop overview | WMS-001…014, BRD-02 | 3 | Planned | — | — |
| WEB-009 | Live repair Kanban board | WMS-001…014, BRD-02 | 3 | Implemented — open jobs by status, overdue badge, tasks progress | /[locale]/c/[id]/jobs | e2e "board" |
| WEB-010 | Appointment calendar | WMS-001…014, BRD-02 | 3 | Planned | — | — |
| WEB-011 | Create service appointment | WMS-001…014, BRD-02 | 3 | Planned | — | — |
| WEB-012 | Vehicle registry | WMS-001…014, BRD-02 | 3 | Implemented — search by plate/VIN/make/model/owner | /[locale]/c/[id]/vehicles | workshop.int; e2e |
| WEB-013 | Vehicle profile and service history | WMS-001…014, BRD-02 | 3 | Implemented — profile, owner transfer, job history | /[locale]/c/[id]/vehicles/[vehicleId] | workshop.int; e2e |
| WEB-014 | Vehicle check-in | WMS-001…014, BRD-02 | 3 | Partial — complaint, odometer, fuel, promised time, tasks; no photos/inspection | /[locale]/c/[id]/jobs/new | e2e "check-in" |
| WEB-015 | Initial inspection and photographs | WMS-001…014, BRD-02 | 3 | Planned | — | — |
| WEB-016 | Diagnosis and fault codes | WMS-001…014, BRD-02 | 3 | Planned | — | — |
| WEB-017 | Create repair quotation | WMS-001…014, BRD-02 | 3 | Planned | — | — |
| WEB-018 | Quotation details and approval history | WMS-001…014, BRD-02 | 3 | Planned | — | — |
| WEB-019 | Job card management | WMS-001…014, BRD-02 | 3 | Implemented — list view | /[locale]/c/[id]/jobs?view=list | workshop.int |
| WEB-020 | Job card details | WMS-001…014, BRD-02 | 3 | Partial — details, tasks, steps, timeline, notes; no quotation/parts/invoice (D-05, D-06) | /[locale]/c/[id]/jobs/[jobId] | workshop.int (16); e2e |
| WEB-021 | Technician assignment | WMS-001…014, BRD-02 | 3 | Implemented — per task, only technicians of the branch | job details | workshop.int; e2e |
| WEB-022 | Workshop bay allocation | WMS-001…014, BRD-02 | 3 | Planned | — | — |
| WEB-023 | Labor time tracking | WMS-001…014, BRD-02 | 3 | Planned | — | — |
| WEB-024 | Spare parts reservation and issuance | WMS-001…014, BRD-02 | 3 | Planned | — | — |
| WEB-025 | Additional repair requests | WMS-001…014, BRD-02 | 3 | Planned | — | — |
| WEB-026 | Repair progress and ETA | WMS-001…014, BRD-02 | 3 | Partial — status, promised time, overdue, notifications | job details, board | workshop.int |
| WEB-027 | Outsourced repair services | WMS-001…014, BRD-02 | 3 | Planned | — | — |
| WEB-028 | Final inspection | WMS-001…014, BRD-02 | 3 | Implemented — pass/fail with note, reopen tasks; inspector ≠ technician | job details | workshop.int; e2e |
| WEB-029 | Vehicle delivery | WMS-001…014, BRD-02 | 3 | Partial — hand-over with receiver and odometer; no invoice/payment yet (D-05) | job details | workshop.int |
| WEB-030 | Job profitability analysis | WMS-001…014, BRD-02 | 3 | Planned | — | — |
| WEB-031 | Warranty management | WMS-001…014, BRD-02 | 3 | Planned | — | — |

## Web — Spare parts

| ID | View | Requirements | Phase | Status | Route / location | Evidence |
|---|---|---|---|---|---|---|
| WEB-032 | Spare parts dashboard | INV-001…004, INV-014 | 2 | Planned | — | — |
| WEB-033 | Product catalog | INV-001…004, INV-014 | 2 | Planned | — | — |
| WEB-034 | Create and edit spare part | INV-001…004, INV-014 | 2 | Planned | — | — |
| WEB-035 | Product details | INV-001…004, INV-014 | 2 | Planned | — | — |
| WEB-036 | Categories and subcategories | INV-001…004, INV-014 | 2 | Planned | — | — |
| WEB-037 | Manufacturers and brands | INV-001…004, INV-014 | 2 | Planned | — | — |
| WEB-038 | OEM and alternative part numbers | INV-001…004, INV-014 | 2 | Planned | — | — |
| WEB-039 | Vehicle compatibility | INV-001…004, INV-014 | 2 | Planned | — | — |
| WEB-040 | Barcode management | INV-001…004, INV-014 | 2 | Planned | — | — |
| WEB-041 | Product pricing | INV-001…004, INV-014 | 2 | Planned | — | — |
| WEB-042 | Wholesale price lists | INV-001…004, INV-014 | 2 | Planned | — | — |
| WEB-043 | Product bundles and kits | INV-001…004, INV-014 | 2 | Planned | — | — |
| WEB-044 | Product image management | INV-001…004, INV-014 | 2 | Planned | — | — |
| WEB-045 | Special-order requests | INV-001…004, INV-014 | 2 | Planned | — | — |

## Web — Inventory

| ID | View | Requirements | Phase | Status | Route / location | Evidence |
|---|---|---|---|---|---|---|
| WEB-046 | Inventory dashboard | INV-005…013, BRD-03 | 2 | Planned | — | — |
| WEB-047 | Stock availability | INV-005…013, BRD-03 | 2 | Planned | — | — |
| WEB-048 | Warehouse management | INV-005…013, BRD-03 | 2 | Planned | — | — |
| WEB-049 | Storage locations and bins | INV-005…013, BRD-03 | 2 | Planned | — | — |
| WEB-050 | Stock movement history | INV-005…013, BRD-03 | 2 | Planned | — | — |
| WEB-051 | Goods receipt | INV-005…013, BRD-03 | 2 | Planned | — | — |
| WEB-052 | Stock issuance | INV-005…013, BRD-03 | 2 | Planned | — | — |
| WEB-053 | Stock reservation | INV-005…013, BRD-03 | 2 | Planned | — | — |
| WEB-054 | Warehouse transfer | INV-005…013, BRD-03 | 2 | Planned | — | — |
| WEB-055 | Transfer tracking | INV-005…013, BRD-03 | 2 | Planned | — | — |
| WEB-056 | Stock adjustments | INV-005…013, BRD-03 | 2 | Planned | — | — |
| WEB-057 | Physical stock counting | INV-005…013, BRD-03 | 2 | Planned | — | — |
| WEB-058 | Inventory discrepancies | INV-005…013, BRD-03 | 2 | Planned | — | — |
| WEB-059 | Damaged and quarantined stock | INV-005…013, BRD-03 | 2 | Planned | — | — |
| WEB-060 | Stock write-off | INV-005…013, BRD-03 | 2 | Planned | — | — |
| WEB-061 | Low-stock alerts | INV-005…013, BRD-03 | 2 | Planned | — | — |
| WEB-062 | Dead-stock analysis | INV-005…013, BRD-03 | 2 | Planned | — | — |
| WEB-063 | Inventory valuation | INV-005…013, BRD-03 | 2 | Planned | — | — |
| WEB-064 | Serial number tracking | INV-005…013, BRD-03 | 2 | Planned | — | — |
| WEB-065 | Landed cost allocation | INV-005…013, BRD-03 | 2 | Planned | — | — |

## Web — Procurement

| ID | View | Requirements | Phase | Status | Route / location | Evidence |
|---|---|---|---|---|---|---|
| WEB-066 | Procurement dashboard | PRC-001…010 | 2 | Planned | — | — |
| WEB-067 | Supplier directory | PRC-001…010 | 2 | Planned | — | — |
| WEB-068 | Supplier profile | PRC-001…010 | 2 | Planned | — | — |
| WEB-069 | Purchase requisitions | PRC-001…010 | 2 | Planned | — | — |
| WEB-070 | Request for quotation | PRC-001…010 | 2 | Planned | — | — |
| WEB-071 | Supplier quotation comparison | PRC-001…010 | 2 | Planned | — | — |
| WEB-072 | Purchase orders | PRC-001…010 | 2 | Planned | — | — |
| WEB-073 | Create purchase order | PRC-001…010 | 2 | Planned | — | — |
| WEB-074 | Purchase order details | PRC-001…010 | 2 | Planned | — | — |
| WEB-075 | Purchase approval | PRC-001…010 | 2 | Planned | — | — |
| WEB-076 | Incoming shipments | PRC-001…010 | 2 | Planned | — | — |
| WEB-077 | Goods receiving and inspection | PRC-001…010 | 2 | Planned | — | — |
| WEB-078 | Three-way invoice matching | PRC-001…010 | 2 | Planned | — | — |
| WEB-079 | Purchase returns | PRC-001…010 | 2 | Planned | — | — |
| WEB-080 | Supplier performance | PRC-001…010 | 2 | Planned | — | — |

## Web — Sales and POS

| ID | View | Requirements | Phase | Status | Route / location | Evidence |
|---|---|---|---|---|---|---|
| WEB-081 | Sales dashboard | POS-001…012 | 3 | Planned | — | — |
| WEB-082 | Point of sale terminal | POS-001…012 | 3 | Planned | — | — |
| WEB-083 | Sales quotations | POS-001…012 | 3 | Planned | — | — |
| WEB-084 | Sales orders | POS-001…012 | 3 | Planned | — | — |
| WEB-085 | Wholesale orders | POS-001…012 | 3 | Planned | — | — |
| WEB-086 | Checkout and payment | POS-001…012 | 3 | Planned | — | — |
| WEB-087 | Split and partial payments | POS-001…012 | 3 | Planned | — | — |
| WEB-088 | Customer deposits | POS-001…012 | 3 | Planned | — | — |
| WEB-089 | Sales invoices | POS-001…012 | 3 | Planned | — | — |
| WEB-090 | Returns and refunds | POS-001…012 | 3 | Planned | — | — |
| WEB-091 | Discounts and promotions | POS-001…012 | 3 | Planned | — | — |
| WEB-092 | Customer credit limits | POS-001…012 | 3 | Planned | — | — |
| WEB-093 | Cashier shift opening | POS-001…012 | 3 | Planned | — | — |
| WEB-094 | Cashier shift closing | POS-001…012 | 3 | Planned | — | — |
| WEB-095 | Cash reconciliation | POS-001…012 | 3 | Planned | — | — |
| WEB-096 | Delivery management | POS-001…012 | 3 | Planned | — | — |
| WEB-097 | Sales commissions | POS-001…012 | 3 | Planned | — | — |

## Web — Finance

| ID | View | Requirements | Phase | Status | Route / location | Evidence |
|---|---|---|---|---|---|---|
| WEB-098 | Finance dashboard | ACC-001…017, BRD-04 | 1–6 | Planned | — | — |
| WEB-099 | Chart of accounts | ACC-001 | 1 | Implemented | /[locale]/c/[id]/accounts | e2e "Build a chart of accounts…" |
| WEB-100 | General ledger | ACC-002 | 1 | Implemented — one posting account, opening/running/closing balance, keyset pages, drill to journal, branch filter | /[locale]/c/[id]/ledger | e2e "Drill down", "General ledger without an account"; reporting.int GL tests |
| WEB-101 | Journal entries | ACC-002 | 1 | Implemented | /[locale]/c/[id]/journals | e2e "Journal list…" |
| WEB-102 | Create journal voucher | ACC-002 | 1 | Implemented | /[locale]/c/[id]/journals/new | e2e "Journal form…", "Post a balanced journal…" |
| WEB-103 | Journal reversal | ACC-002 | 1 | Implemented | /[locale]/c/[id]/journals/[journalId] (reverse) | e2e "Reverse the journal…" |
| WEB-104 | Accounts receivable | ACC-001…017, BRD-04 | 1–6 | Planned | — | — |
| WEB-105 | Accounts payable | ACC-001…017, BRD-04 | 1–6 | Planned | — | — |
| WEB-106 | Customer statements | ACC-001…017, BRD-04 | 1–6 | Planned | — | — |
| WEB-107 | Supplier statements | ACC-001…017, BRD-04 | 1–6 | Planned | — | — |
| WEB-108 | Receivables aging | ACC-001…017, BRD-04 | 1–6 | Planned | — | — |
| WEB-109 | Payables aging | ACC-001…017, BRD-04 | 1–6 | Planned | — | — |
| WEB-110 | Cash accounts | ACC-001…017, BRD-04 | 1–6 | Planned | — | — |
| WEB-111 | Bank accounts | ACC-001…017, BRD-04 | 1–6 | Planned | — | — |
| WEB-112 | Bank reconciliation | ACC-001…017, BRD-04 | 1–6 | Planned | — | — |
| WEB-113 | Payment vouchers | ACC-001…017, BRD-04 | 1–6 | Planned | — | — |
| WEB-114 | Receipt vouchers | ACC-001…017, BRD-04 | 1–6 | Planned | — | — |
| WEB-115 | Expense management | ACC-001…017, BRD-04 | 1–6 | Planned | — | — |
| WEB-116 | Petty cash | ACC-001…017, BRD-04 | 1–6 | Planned | — | — |
| WEB-117 | Fixed assets | ACC-001…017, BRD-04 | 1–6 | Planned | — | — |
| WEB-118 | Depreciation | ACC-001…017, BRD-04 | 1–6 | Planned | — | — |
| WEB-119 | Cost centers | ACC-009 | 1 | Planned | — | — |
| WEB-120 | Budget management | ACC-001…017, BRD-04 | 1–6 | Planned | — | — |
| WEB-121 | Budget versus actual | ACC-001…017, BRD-04 | 1–6 | Planned | — | — |
| WEB-122 | Trial balance | ACC-016, REPORTING | 1 | Implemented — opening, period debit/credit, closing; header roll-up; balanced check; period result; branch filter; drill to ledger; CSV/Excel export (WEB-205); print to PDF | /[locale]/c/[id]/trial-balance | e2e "Trial balance"; reporting.int TB tests (hand-calculated) |
| WEB-123 | Profit and loss | ACC-016 | 5 | Planned | — | — |
| WEB-124 | Balance sheet | ACC-016 | 5 | Planned | — | — |
| WEB-125 | Cash flow statement | ACC-016 | 5 | Planned | — | — |
| WEB-126 | Financial period closing | ACC-008 | 1 | Partial — close with reason; no close checklist/reopen | /[locale]/c/[id]/periods | e2e "Close a period…" |
| WEB-127 | Tax configuration | ACC-010 (blocked: D-05) | 1 | Planned | — | — |
| WEB-128 | Currency and exchange rates | ACC-010 (blocked: D-07) | 2 | Planned | — | — |
| WEB-129 | Credit and debit notes | ACC-001…017, BRD-04 | 1–6 | Planned | — | — |
| WEB-130 | Work in progress accounting | ACC-001…017, BRD-04 | 1–6 | Planned | — | — |
| WEB-131 | Opening balances | ACC-014 (blocked: D-14) | 1 | Planned | — | — |
| WEB-132 | Accruals and prepayments | ACC-001…017, BRD-04 | 1–6 | Planned | — | — |
| WEB-133 | Financial reconciliation | ACC-001…017, BRD-04 | 1–6 | Planned | — | — |
| WEB-134 | Intercompany transactions | ACC-017 | 1 | Planned | — | — |

## Web — HR

| ID | View | Requirements | Phase | Status | Route / location | Evidence |
|---|---|---|---|---|---|---|
| WEB-135 | HR dashboard | HR-001…013, BRD-05 | 6 | Planned | — | — |
| WEB-136 | Employee directory | HR-001…013, BRD-05 | 6 | Planned | — | — |
| WEB-137 | Employee profile | HR-001…013, BRD-05 | 6 | Planned | — | — |
| WEB-138 | Employee onboarding | HR-001…013, BRD-05 | 6 | Planned | — | — |
| WEB-139 | Contracts and documents | HR-001…013, BRD-05 | 6 | Planned | — | — |
| WEB-140 | Organizational structure | HR-001…013, BRD-05 | 6 | Planned | — | — |
| WEB-141 | Attendance management | HR-001…013, BRD-05 | 6 | Planned | — | — |
| WEB-142 | Shift scheduling | HR-001…013, BRD-05 | 6 | Planned | — | — |
| WEB-143 | Leave management | HR-001…013, BRD-05 | 6 | Planned | — | — |
| WEB-144 | Overtime management | HR-001…013, BRD-05 | 6 | Planned | — | — |
| WEB-145 | Payroll dashboard | HR-001…013, BRD-05 | 6 | Planned | — | — |
| WEB-146 | Payroll calculation | HR-001…013, BRD-05 | 6 | Planned | — | — |
| WEB-147 | Salary components | HR-001…013, BRD-05 | 6 | Planned | — | — |
| WEB-148 | Allowances and deductions | HR-001…013, BRD-05 | 6 | Planned | — | — |
| WEB-149 | Loans and advances | HR-001…013, BRD-05 | 6 | Planned | — | — |
| WEB-150 | Payslips | HR-001…013, BRD-05 | 6 | Planned | — | — |
| WEB-151 | Payroll approval | HR-001…013, BRD-05 | 6 | Planned | — | — |
| WEB-152 | Performance evaluations | HR-001…013, BRD-05 | 6 | Planned | — | — |
| WEB-153 | Technician productivity | HR-001…013, BRD-05 | 6 | Planned | — | — |
| WEB-154 | Employee document expiration | HR-001…013, BRD-05 | 6 | Planned | — | — |
| WEB-155 | Employee self-service | HR-001…013, BRD-05 | 6 | Planned | — | — |
| WEB-156 | End-of-service calculation | HR-001…013, BRD-05 | 6 | Planned | — | — |
| WEB-157 | Employee offboarding | HR-001…013, BRD-05 | 6 | Planned | — | — |

## Web — CRM

| ID | View | Requirements | Phase | Status | Route / location | Evidence |
|---|---|---|---|---|---|---|
| WEB-158 | CRM dashboard | CRM-001…012 | 6 | Planned | — | — |
| WEB-159 | Customer directory | CRM-001…012 | 6 | Planned | — | — |
| WEB-160 | Customer 360 profile | CRM-001…012 | 6 | Planned | — | — |
| WEB-161 | Corporate customers | CRM-001…012 | 6 | Planned | — | — |
| WEB-162 | Contact management | CRM-001…012 | 6 | Planned | — | — |
| WEB-163 | Leads | CRM-001…012 | 6 | Planned | — | — |
| WEB-164 | Sales opportunities | CRM-001…012 | 6 | Planned | — | — |
| WEB-165 | Sales pipeline | CRM-001…012 | 6 | Planned | — | — |
| WEB-166 | Communication history | CRM-001…012 | 6 | Planned | — | — |
| WEB-167 | Follow-up tasks | CRM-001…012 | 6 | Planned | — | — |
| WEB-168 | Customer complaints | CRM-001…012 | 6 | Planned | — | — |
| WEB-169 | Customer feedback | CRM-001…012 | 6 | Planned | — | — |
| WEB-170 | Customer segmentation | CRM-001…012 | 6 | Planned | — | — |
| WEB-171 | Loyalty program | CRM-001…012 | 6 | Planned | — | — |
| WEB-172 | Marketing campaigns | CRM-001…012 | 6 | Planned | — | — |
| WEB-173 | Maintenance reminders | CRM-001…012 | 6 | Planned | — | — |
| WEB-174 | Outstanding payment reminders | CRM-001…012 | 6 | Planned | — | — |
| WEB-175 | Fleet contracts | CRM-001…012 | 6 | Planned | — | — |

## Web — Quality and assets

| ID | View | Requirements | Phase | Status | Route / location | Evidence |
|---|---|---|---|---|---|---|
| WEB-176 | Quality dashboard | QAS-001…008 | 3/6 | Planned | — | — |
| WEB-177 | Inspection templates | QAS-001…008 | 3/6 | Planned | — | — |
| WEB-178 | Quality inspection execution | QAS-001…008 | 3/6 | Planned | — | — |
| WEB-179 | Failed inspections | QAS-001…008 | 3/6 | Planned | — | — |
| WEB-180 | Rework management | QAS-001…008 | 3/6 | Planned | — | — |
| WEB-181 | Warranty claims | QAS-001…008 | 3/6 | Planned | — | — |
| WEB-182 | Root cause analysis | QAS-001…008 | 3/6 | Planned | — | — |
| WEB-183 | Supplier quality | QAS-001…008 | 3/6 | Planned | — | — |
| WEB-184 | Equipment and tools registry | QAS-001…008 | 3/6 | Planned | — | — |
| WEB-185 | Equipment assignment | QAS-001…008 | 3/6 | Planned | — | — |
| WEB-186 | Preventive maintenance | QAS-001…008 | 3/6 | Planned | — | — |
| WEB-187 | Calibration management | QAS-001…008 | 3/6 | Planned | — | — |

## Web — Reporting

| ID | View | Requirements | Phase | Status | Route / location | Evidence |
|---|---|---|---|---|---|---|
| WEB-188 | Central reporting hub | REPORTING (RPT), BRD-07 | 5 | Planned | — | — |
| WEB-189 | Financial reports | REPORTING (RPT), BRD-07 | 5 | Planned | — | — |
| WEB-190 | Workshop reports | REPORTING (RPT), BRD-07 | 5 | Planned | — | — |
| WEB-191 | Inventory reports | REPORTING (RPT), BRD-07 | 5 | Planned | — | — |
| WEB-192 | Sales reports | REPORTING (RPT), BRD-07 | 5 | Planned | — | — |
| WEB-193 | Procurement reports | REPORTING (RPT), BRD-07 | 5 | Planned | — | — |
| WEB-194 | HR reports | REPORTING (RPT), BRD-07 | 5 | Planned | — | — |
| WEB-195 | CRM reports | REPORTING (RPT), BRD-07 | 5 | Planned | — | — |
| WEB-196 | E-commerce reports | REPORTING (RPT), BRD-07 | 5 | Planned | — | — |
| WEB-197 | Quality reports | REPORTING (RPT), BRD-07 | 5 | Planned | — | — |
| WEB-198 | Audit reports | REPORTING (RPT), BRD-07 | 5 | Planned | — | — |
| WEB-199 | Dynamic report builder | REPORTING (RPT), BRD-07 | 5 | Planned | — | — |
| WEB-200 | Pivot table designer | REPORTING (RPT), BRD-07 | 5 | Planned | — | — |
| WEB-201 | Custom dashboard builder | REPORTING (RPT), BRD-07 | 5 | Planned | — | — |
| WEB-202 | KPI drill-down | REPORTING (RPT), BRD-07 | 5 | Planned | — | — |
| WEB-203 | Historical period comparison | REPORTING (RPT), BRD-07 | 5 | Planned | — | — |
| WEB-204 | Scheduled reports | REPORTING (RPT), BRD-07 | 5 | Planned | — | — |
| WEB-205 | Export and download center | REPORTING (RPT), BRD-07 | 5 (early) | Implemented — CSV and Excel for trial balance, general ledger and journal lines; background jobs; requester-only downloads with permission recheck and audit; 7-day retention. PDF via print (T-43) | /[locale]/c/[id]/exports | exports.int (14); e2e "Export centre" (2) + staff check |
| WEB-206 | Report templates | REPORTING (RPT), BRD-07 | 5 | Planned | — | — |
| WEB-207 | Report reconciliation | REPORTING (RPT), BRD-07 | 5 | Planned | — | — |

## Web — Commerce

| ID | View | Requirements | Phase | Status | Route / location | Evidence |
|---|---|---|---|---|---|---|
| WEB-208 | Online store dashboard | BRD-06, MOBILE | 4 | Planned | — | — |
| WEB-209 | Online product publishing | BRD-06, MOBILE | 4 | Planned | — | — |
| WEB-210 | Online orders | BRD-06, MOBILE | 4 | Planned | — | — |
| WEB-211 | Order details | BRD-06, MOBILE | 4 | Planned | — | — |
| WEB-212 | Order fulfillment | BRD-06, MOBILE | 4 | Planned | — | — |
| WEB-213 | Delivery tracking | BRD-06, MOBILE | 4 | Planned | — | — |
| WEB-214 | Online returns | BRD-06, MOBILE | 4 | Planned | — | — |
| WEB-215 | Shopping cart analytics | BRD-06, MOBILE | 4 | Planned | — | — |
| WEB-216 | Online promotions | BRD-06, MOBILE | 4 | Planned | — | — |
| WEB-217 | Customer app content management | BRD-06, MOBILE | 4 | Planned | — | — |

## Web — Administration

| ID | View | Requirements | Phase | Status | Route / location | Evidence |
|---|---|---|---|---|---|---|
| WEB-218 | Login | SEC-04 | 1 | Implemented (Keycloak) | /session/login → Keycloak | e2e sign-in; deploy check 14/14 |
| WEB-219 | Password recovery | SEC-04 (needs SMTP decision) | 1 | Planned | — | — |
| WEB-220 | MFA verification | SEC-04, SECURITY_QA MFA | 1 | Implemented (Keycloak TOTP) | Keycloak required action / OTP form | e2e + deploy check |
| WEB-221 | User profile | ADM-001…011, SECURITY_QA | 1 | Partial — profile menu (name, theme, sign out) | header profile menu | e2e sign-out |
| WEB-222 | Company configuration | ADM-001 | 1 | Partial — create only | /[locale]/companies/new | e2e "Create a company" |
| WEB-223 | Branch configuration | ADM-001 | 1 | Partial — create/list | /[locale]/c/[id]/branches | e2e "Branches" |
| WEB-224 | User management | ADM-002, SEC-04 | 1 | Implemented — list, add staff (Keycloak account + role, one-time temporary password), profile, give/remove role, reset password, deactivate/reactivate | /[locale]/c/[id]/users, /users/[userId] | e2e "Add a staff member", "new staff member signs in", "Profile", "Deactivate"; staff.int 22 tests |
| WEB-225 | Role management | ADM-002 | 1 | Implemented — list with member counts, create, edit (optimistic version), delete unused; system roles read-only | /[locale]/c/[id]/roles, /roles/[roleId] | e2e "Create a custom role", "System roles are read-only"; staff.int roles tests |
| WEB-226 | Permission matrix | ADM-002 | 1 | Implemented — read-only roles × grouped permissions | /[locale]/c/[id]/permissions | e2e "appears in the matrix" |
| WEB-227 | Approval workflow configuration | ADM-003 (needs D-11) | 1 | Planned | — | — |
| WEB-228 | Feature management | ADM-004 | 1 | Planned | — | — |
| WEB-229 | Notification configuration | ADM-008 | 5 | Planned | — | — |
| WEB-230 | Document templates | ADM-005 | 5 | Planned | — | — |
| WEB-231 | Audit logs | ADM-007 | 1 | Partial — list with paging; no filters | /[locale]/c/[id]/audit | e2e "Audit trail…" |
| WEB-232 | Active sessions | SECURITY_QA | 1 | Planned | — | — |
| WEB-233 | Integration settings | ADM-001…011, SECURITY_QA | 1 | Planned | — | — |
| WEB-234 | Data import and export | ADM-009 | 5 | Planned | — | — |
| WEB-235 | Branding and localization | ADM-006 | 1 | Planned | — | — |
| WEB-236 | System health | ARCH-11 | 0 | Partial — status panel on home | /[locale] | smoke test |
| WEB-237 | Global search | ADM-010 | 2 | Implemented — journals, accounts, branches, fiscal periods, people; permission/branch scoped; Arabic variants; header box with "/" shortcut | /[locale]/c/[id]/search | search.int (8); e2e "Global search" (2 checks) + staff check |

## CUS mobile application

| ID | View | Requirements | Phase | Status | Route / location | Evidence |
|---|---|---|---|---|---|---|
| CUS-001 | Splash | MOBILE (customer), BRD-06 | 4 — postponed by owner | Shell only; app postponed by owner | apps/customer-mobile | jest-expo 3 |
| CUS-002 | Onboarding | MOBILE (customer), BRD-06 | 4 — postponed by owner | Postponed (owner decision) | — | — |
| CUS-003 | Login | MOBILE (customer), BRD-06 | 4 — postponed by owner | Postponed (owner decision) | — | — |
| CUS-004 | Registration | MOBILE (customer), BRD-06 | 4 — postponed by owner | Postponed (owner decision) | — | — |
| CUS-005 | OTP | MOBILE (customer), BRD-06 | 4 — postponed by owner | Postponed (owner decision) | — | — |
| CUS-006 | Biometrics | MOBILE (customer), BRD-06 | 4 — postponed by owner | Postponed (owner decision) | — | — |
| CUS-007 | Home | MOBILE (customer), BRD-06 | 4 — postponed by owner | Postponed (owner decision) | — | — |
| CUS-008 | Notifications | MOBILE (customer), BRD-06 | 4 — postponed by owner | Postponed (owner decision) | — | — |
| CUS-009 | Offers | MOBILE (customer), BRD-06 | 4 — postponed by owner | Postponed (owner decision) | — | — |
| CUS-010 | Branch locator | MOBILE (customer), BRD-06 | 4 — postponed by owner | Postponed (owner decision) | — | — |
| CUS-011 | Vehicle list | MOBILE (customer), BRD-06 | 4 — postponed by owner | Postponed (owner decision) | — | — |
| CUS-012 | Vehicle details | MOBILE (customer), BRD-06 | 4 — postponed by owner | Postponed (owner decision) | — | — |
| CUS-013 | Add vehicle | MOBILE (customer), BRD-06 | 4 — postponed by owner | Postponed (owner decision) | — | — |
| CUS-014 | VIN entry | MOBILE (customer), BRD-06 | 4 — postponed by owner | Postponed (owner decision) | — | — |
| CUS-015 | Service history | MOBILE (customer), BRD-06 | 4 — postponed by owner | Postponed (owner decision) | — | — |
| CUS-016 | Documents | MOBILE (customer), BRD-06 | 4 — postponed by owner | Postponed (owner decision) | — | — |
| CUS-017 | Maintenance schedule | MOBILE (customer), BRD-06 | 4 — postponed by owner | Postponed (owner decision) | — | — |
| CUS-018 | Service catalog | MOBILE (customer), BRD-06 | 4 — postponed by owner | Postponed (owner decision) | — | — |
| CUS-019 | Service details | MOBILE (customer), BRD-06 | 4 — postponed by owner | Postponed (owner decision) | — | — |
| CUS-020 | Branch selection | MOBILE (customer), BRD-06 | 4 — postponed by owner | Postponed (owner decision) | — | — |
| CUS-021 | Appointment slots | MOBILE (customer), BRD-06 | 4 — postponed by owner | Postponed (owner decision) | — | — |
| CUS-022 | Problem description | MOBILE (customer), BRD-06 | 4 — postponed by owner | Postponed (owner decision) | — | — |
| CUS-023 | Photo upload | MOBILE (customer), BRD-06 | 4 — postponed by owner | Postponed (owner decision) | — | — |
| CUS-024 | Confirmation | MOBILE (customer), BRD-06 | 4 — postponed by owner | Postponed (owner decision) | — | — |
| CUS-025 | Manage booking | MOBILE (customer), BRD-06 | 4 — postponed by owner | Postponed (owner decision) | — | — |
| CUS-026 | Active repairs | MOBILE (customer), BRD-06 | 4 — postponed by owner | Postponed (owner decision) | — | — |
| CUS-027 | Repair details | MOBILE (customer), BRD-06 | 4 — postponed by owner | Postponed (owner decision) | — | — |
| CUS-028 | Diagnosis | MOBILE (customer), BRD-06 | 4 — postponed by owner | Postponed (owner decision) | — | — |
| CUS-029 | Quotation | MOBILE (customer), BRD-06 | 4 — postponed by owner | Postponed (owner decision) | — | — |
| CUS-030 | Quotation approval | MOBILE (customer), BRD-06 | 4 — postponed by owner | Postponed (owner decision) | — | — |
| CUS-031 | Additional approval | MOBILE (customer), BRD-06 | 4 — postponed by owner | Postponed (owner decision) | — | — |
| CUS-032 | Repair timeline | MOBILE (customer), BRD-06 | 4 — postponed by owner | Postponed (owner decision) | — | — |
| CUS-033 | Inspection results | MOBILE (customer), BRD-06 | 4 — postponed by owner | Postponed (owner decision) | — | — |
| CUS-034 | Store | MOBILE (customer), BRD-06 | 4 — postponed by owner | Postponed (owner decision) | — | — |
| CUS-035 | Categories | MOBILE (customer), BRD-06 | 4 — postponed by owner | Postponed (owner decision) | — | — |
| CUS-036 | Search | MOBILE (customer), BRD-06 | 4 — postponed by owner | Postponed (owner decision) | — | — |
| CUS-037 | Vehicle compatibility | MOBILE (customer), BRD-06 | 4 — postponed by owner | Postponed (owner decision) | — | — |
| CUS-038 | Product details | MOBILE (customer), BRD-06 | 4 — postponed by owner | Postponed (owner decision) | — | — |
| CUS-039 | Comparison | MOBILE (customer), BRD-06 | 4 — postponed by owner | Postponed (owner decision) | — | — |
| CUS-040 | Favorites | MOBILE (customer), BRD-06 | 4 — postponed by owner | Postponed (owner decision) | — | — |
| CUS-041 | Special orders | MOBILE (customer), BRD-06 | 4 — postponed by owner | Postponed (owner decision) | — | — |
| CUS-042 | Stock alerts | MOBILE (customer), BRD-06 | 4 — postponed by owner | Postponed (owner decision) | — | — |
| CUS-043 | Cart | MOBILE (customer), BRD-06 | 4 — postponed by owner | Postponed (owner decision) | — | — |
| CUS-044 | Delivery address | MOBILE (customer), BRD-06 | 4 — postponed by owner | Postponed (owner decision) | — | — |
| CUS-045 | Pickup selection | MOBILE (customer), BRD-06 | 4 — postponed by owner | Postponed (owner decision) | — | — |
| CUS-046 | Installation booking | MOBILE (customer), BRD-06 | 4 — postponed by owner | Postponed (owner decision) | — | — |
| CUS-047 | Checkout | MOBILE (customer), BRD-06 | 4 — postponed by owner | Postponed (owner decision) | — | — |
| CUS-048 | Payment | MOBILE (customer), BRD-06 | 4 — postponed by owner | Postponed (owner decision) | — | — |
| CUS-049 | Confirmation | MOBILE (customer), BRD-06 | 4 — postponed by owner | Postponed (owner decision) | — | — |
| CUS-050 | Order history | MOBILE (customer), BRD-06 | 4 — postponed by owner | Postponed (owner decision) | — | — |
| CUS-051 | Order details | MOBILE (customer), BRD-06 | 4 — postponed by owner | Postponed (owner decision) | — | — |
| CUS-052 | Delivery tracking | MOBILE (customer), BRD-06 | 4 — postponed by owner | Postponed (owner decision) | — | — |
| CUS-053 | Return request | MOBILE (customer), BRD-06 | 4 — postponed by owner | Postponed (owner decision) | — | — |
| CUS-054 | Refund status | MOBILE (customer), BRD-06 | 4 — postponed by owner | Postponed (owner decision) | — | — |
| CUS-055 | Invoices | MOBILE (customer), BRD-06 | 4 — postponed by owner | Postponed (owner decision) | — | — |
| CUS-056 | Invoice details | MOBILE (customer), BRD-06 | 4 — postponed by owner | Postponed (owner decision) | — | — |
| CUS-057 | Deposits | MOBILE (customer), BRD-06 | 4 — postponed by owner | Postponed (owner decision) | — | — |
| CUS-058 | Payment history | MOBILE (customer), BRD-06 | 4 — postponed by owner | Postponed (owner decision) | — | — |
| CUS-059 | Receipts | MOBILE (customer), BRD-06 | 4 — postponed by owner | Postponed (owner decision) | — | — |
| CUS-060 | Loyalty | MOBILE (customer), BRD-06 | 4 — postponed by owner | Postponed (owner decision) | — | — |
| CUS-061 | Rewards | MOBILE (customer), BRD-06 | 4 — postponed by owner | Postponed (owner decision) | — | — |
| CUS-062 | Support chat | MOBILE (customer), BRD-06 | 4 — postponed by owner | Postponed (owner decision) | — | — |
| CUS-063 | Complaints | MOBILE (customer), BRD-06 | 4 — postponed by owner | Postponed (owner decision) | — | — |
| CUS-064 | Ratings | MOBILE (customer), BRD-06 | 4 — postponed by owner | Postponed (owner decision) | — | — |
| CUS-065 | Warranty | MOBILE (customer), BRD-06 | 4 — postponed by owner | Postponed (owner decision) | — | — |
| CUS-066 | Profile | MOBILE (customer), BRD-06 | 4 — postponed by owner | Postponed (owner decision) | — | — |
| CUS-067 | Preferences | MOBILE (customer), BRD-06 | 4 — postponed by owner | Postponed (owner decision) | — | — |
| CUS-068 | Language | MOBILE (customer), BRD-06 | 4 — postponed by owner | Postponed (owner decision) | — | — |
| CUS-069 | Security | MOBILE (customer), BRD-06 | 4 — postponed by owner | Postponed (owner decision) | — | — |
| CUS-070 | Privacy | MOBILE (customer), BRD-06 | 4 — postponed by owner | Postponed (owner decision) | — | — |
| CUS-071 | Account deletion | MOBILE (customer), BRD-06 | 4 — postponed by owner | Postponed (owner decision) | — | — |

## MGR mobile application

| ID | View | Requirements | Phase | Status | Route / location | Evidence |
|---|---|---|---|---|---|---|
| MGR-001 | Login | MOBILE (manager), BRD-06 | 5 | Shell only (no sign-in yet) | apps/manager-mobile | jest-expo 3 |
| MGR-002 | MFA | MOBILE (manager), BRD-06 | 5 | Planned | — | — |
| MGR-003 | Biometrics | MOBILE (manager), BRD-06 | 5 | Planned | — | — |
| MGR-004 | Company selection | MOBILE (manager), BRD-06 | 5 | Planned | — | — |
| MGR-005 | Overview | MOBILE (manager), BRD-06 | 5 | Planned | — | — |
| MGR-006 | Revenue | MOBILE (manager), BRD-06 | 5 | Planned | — | — |
| MGR-007 | Gross profit | MOBILE (manager), BRD-06 | 5 | Planned | — | — |
| MGR-008 | Net profit | MOBILE (manager), BRD-06 | 5 | Planned | — | — |
| MGR-009 | Branch comparison | MOBILE (manager), BRD-06 | 5 | Planned | — | — |
| MGR-010 | Cash flow | MOBILE (manager), BRD-06 | 5 | Planned | — | — |
| MGR-011 | KPI details | MOBILE (manager), BRD-06 | 5 | Planned | — | — |
| MGR-012 | Business alerts | MOBILE (manager), BRD-06 | 5 | Planned | — | — |
| MGR-013 | Workshop overview | MOBILE (manager), BRD-06 | 5 | Planned | — | — |
| MGR-014 | Active jobs | MOBILE (manager), BRD-06 | 5 | Planned | — | — |
| MGR-015 | Job details | MOBILE (manager), BRD-06 | 5 | Planned | — | — |
| MGR-016 | Overdue jobs | MOBILE (manager), BRD-06 | 5 | Planned | — | — |
| MGR-017 | Technician assignments | MOBILE (manager), BRD-06 | 5 | Planned | — | — |
| MGR-018 | Capacity | MOBILE (manager), BRD-06 | 5 | Planned | — | — |
| MGR-019 | Job profitability | MOBILE (manager), BRD-06 | 5 | Planned | — | — |
| MGR-020 | Quality failures | MOBILE (manager), BRD-06 | 5 | Planned | — | — |
| MGR-021 | Stock overview | MOBILE (manager), BRD-06 | 5 | Planned | — | — |
| MGR-022 | Product availability | MOBILE (manager), BRD-06 | 5 | Planned | — | — |
| MGR-023 | Valuation | MOBILE (manager), BRD-06 | 5 | Planned | — | — |
| MGR-024 | Low stock | MOBILE (manager), BRD-06 | 5 | Planned | — | — |
| MGR-025 | Dead stock | MOBILE (manager), BRD-06 | 5 | Planned | — | — |
| MGR-026 | Warehouse comparison | MOBILE (manager), BRD-06 | 5 | Planned | — | — |
| MGR-027 | Discrepancies | MOBILE (manager), BRD-06 | 5 | Planned | — | — |
| MGR-028 | Purchase requests | MOBILE (manager), BRD-06 | 5 | Planned | — | — |
| MGR-029 | Purchase orders | MOBILE (manager), BRD-06 | 5 | Planned | — | — |
| MGR-030 | Order details | MOBILE (manager), BRD-06 | 5 | Planned | — | — |
| MGR-031 | Incoming shipments | MOBILE (manager), BRD-06 | 5 | Planned | — | — |
| MGR-032 | Supplier performance | MOBILE (manager), BRD-06 | 5 | Planned | — | — |
| MGR-033 | Financial overview | MOBILE (manager), BRD-06 | 5 | Planned | — | — |
| MGR-034 | Receivables | MOBILE (manager), BRD-06 | 5 | Planned | — | — |
| MGR-035 | Payables | MOBILE (manager), BRD-06 | 5 | Planned | — | — |
| MGR-036 | Expenses | MOBILE (manager), BRD-06 | 5 | Planned | — | — |
| MGR-037 | Cash closing | MOBILE (manager), BRD-06 | 5 | Planned | — | — |
| MGR-038 | Bank balances | MOBILE (manager), BRD-06 | 5 | Planned | — | — |
| MGR-039 | Financial statements | MOBILE (manager), BRD-06 | 5 | Planned | — | — |
| MGR-040 | Budget variance | MOBILE (manager), BRD-06 | 5 | Planned | — | — |
| MGR-041 | Employee overview | MOBILE (manager), BRD-06 | 5 | Planned | — | — |
| MGR-042 | Attendance | MOBILE (manager), BRD-06 | 5 | Planned | — | — |
| MGR-043 | Productivity | MOBILE (manager), BRD-06 | 5 | Planned | — | — |
| MGR-044 | Leave | MOBILE (manager), BRD-06 | 5 | Planned | — | — |
| MGR-045 | Overtime | MOBILE (manager), BRD-06 | 5 | Planned | — | — |
| MGR-046 | Payroll | MOBILE (manager), BRD-06 | 5 | Planned | — | — |
| MGR-047 | Document expiration | MOBILE (manager), BRD-06 | 5 | Planned | — | — |
| MGR-048 | Customer overview | MOBILE (manager), BRD-06 | 5 | Planned | — | — |
| MGR-049 | Complaints | MOBILE (manager), BRD-06 | 5 | Planned | — | — |
| MGR-050 | Satisfaction | MOBILE (manager), BRD-06 | 5 | Planned | — | — |
| MGR-051 | Opportunities | MOBILE (manager), BRD-06 | 5 | Planned | — | — |
| MGR-052 | Fleet customers | MOBILE (manager), BRD-06 | 5 | Planned | — | — |
| MGR-053 | Approval inbox | MOBILE (manager), BRD-06 | 5 | Planned | — | — |
| MGR-054 | Purchase approval | MOBILE (manager), BRD-06 | 5 | Planned | — | — |
| MGR-055 | Stock adjustment | MOBILE (manager), BRD-06 | 5 | Planned | — | — |
| MGR-056 | Refund | MOBILE (manager), BRD-06 | 5 | Planned | — | — |
| MGR-057 | Discount | MOBILE (manager), BRD-06 | 5 | Planned | — | — |
| MGR-058 | Expense | MOBILE (manager), BRD-06 | 5 | Planned | — | — |
| MGR-059 | Payroll | MOBILE (manager), BRD-06 | 5 | Planned | — | — |
| MGR-060 | Credit limit | MOBILE (manager), BRD-06 | 5 | Planned | — | — |
| MGR-061 | Approval history | MOBILE (manager), BRD-06 | 5 | Planned | — | — |
| MGR-062 | Reports | MOBILE (manager), BRD-06 | 5 | Planned | — | — |
| MGR-063 | Report filters | MOBILE (manager), BRD-06 | 5 | Planned | — | — |
| MGR-064 | Drill-down | MOBILE (manager), BRD-06 | 5 | Planned | — | — |
| MGR-065 | Report details | MOBILE (manager), BRD-06 | 5 | Planned | — | — |
| MGR-066 | Downloads | MOBILE (manager), BRD-06 | 5 | Planned | — | — |
| MGR-067 | Profile | MOBILE (manager), BRD-06 | 5 | Planned | — | — |
| MGR-068 | Notifications | MOBILE (manager), BRD-06 | 5 | Planned | — | — |
| MGR-069 | Thresholds | MOBILE (manager), BRD-06 | 5 | Planned | — | — |
| MGR-070 | Delegation | MOBILE (manager), BRD-06 | 5 | Planned | — | — |
| MGR-071 | Security | MOBILE (manager), BRD-06 | 5 | Planned | — | — |
| MGR-072 | Language | MOBILE (manager), BRD-06 | 5 | Planned | — | — |

## Summary

| Status | Views |
|---|---|
| Implemented | 20 |
| Next | 0 |
| Partial | 10 |
| Planned | 278 |
| Postponed | 70 |
| Shell | 2 |
| **Total** | **380** |
