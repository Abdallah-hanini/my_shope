# AUTO360 ERP — UI/UX Master Design Specification
Version 1.0 | Claude Code implementation directive

## Mission and authority
Act as a senior enterprise product designer, automotive business analyst, design systems architect, Next.js and React Native engineer, accessibility specialist and QA lead. Deliver an exceptional, coherent, high-fidelity experience across the web ERP and two separate native apps. Read the existing master specification and all available BRD, SRS, accounting, reporting, mobile and security documents before changing code. Preserve existing business rules and IDs. This document supplements rather than replaces them. Inspect the repository first; do not overwrite working functionality. Record conflicts and obtain decisions for unresolved business policies. The 380 entries below are proposed views, not necessarily separate routes; map every requirement to a view, action or background process. Add missing views rather than silently dropping requirements.

## Technology and design system
- Next.js, TypeScript, Tailwind, shadcn/ui, Lucide; React Native + Expo for separate customer and manager apps. Shared tokens, typed API contracts and validation; NestJS, PostgreSQL, Redis/BullMQ remain the production architecture.
- Premium automotive enterprise identity: midnight #101828 sidebar, primary #2563EB, canvas #F8FAFC, white surfaces, text #101828, muted #475569, border #E2E8F0, success #059669, warning #D97706, danger #DC2626. Validate contrast; use darker semantic text when needed. Dark theme with dedicated semantic tokens, not inverted colors.
- Inter and IBM Plex Sans Arabic; tabular numerals for money; headings 28/24/20, body 14–16, labels 12–14. 4/8px spacing grid, 8–12px radii, subtle shadows, restrained motion. No generic template, glassmorphism, gratuitous gradients, oversized cards or excessive whitespace in dense tables.
- Desktop 1440x900, tablet 768px, mobile 390x844; responsive from 320px. Desktop sidebar 248px expanded/72px collapsed, 64px header, 24px content padding. Mobile safe areas, 44pt/48dp targets, native navigation, keyboard handling. English and Arabic RTL including mirrored navigation, appropriate number formatting and mixed-direction identifiers. WCAG 2.2 AA target, keyboard navigation, focus, accessible chart alternatives, reduced motion.
- Web shell: company/branch switcher, global search, breadcrumbs, notification inbox, profile, role-specific sidebar. Page header with title, context and primary action; filters above content; details in tabs/drawers where appropriate. Persistent filter state and shareable URLs without sensitive data. Mobile customer tabs Home/Garage/Shop/Bookings/Profile; manager Home/Approvals/Reports/Alerts/More.

## Screen patterns and behavior
Every catalog entry must have a screen contract: ID, route, requirement IDs, persona, purpose, layout, fields, source/API, actions, permissions, validations, states, navigation, responsive/RTL behavior and acceptance tests. Use actual domain-specific content, not identical placeholder dashboards. Lists use search, filters, sortable columns, pagination, saved views and permitted bulk actions. Detail views use identity header, status, related records, timeline and contextual actions. Editors use logical sections, inline errors, unsaved-change protection and explicit confirmation. Dashboards use 4–6 meaningful KPIs, trends, exception lists and drill-down. All views handle loading, empty, error, forbidden, stale and success states; transaction screens prevent duplicate submission and show server-confirmed results. Do not expose restricted costs, salaries or other customers' data. Server-side authorization is mandatory.

## Signature screens and module-specific composition

### Executive
Top KPI row revenue/gross/net/expenses; 12-month trend, department comparison, stock health, cash and exception panel. Filters company/branch/period update all dependent widgets.

### Workshop
Kanban received/diagnosis/approval/repair/QC/ready; cards show vehicle, job ID, ETA, technician and blockers. Job detail has vehicle header, inspection photos, diagnosis, quote revisions, labor, parts, QC and audit tabs. Approval binds exact quote version; QC failure routes to rework.

### Spare parts
Catalog table with thumbnail, SKU/OEM, alternatives, fitment, condition, price, availability and authorized cost. Detail tabs for fitment, pricing, stock and history; barcode search and explicit compatibility uncertainty.

### Inventory
Stock table physical/reserved/blocked/available/transit, warehouse/bin and valuation. Movement ledger immutable; receipt, transfer and count editors show before/after quantities and approval requirements. Never allow negative available stock.

### Procurement
Supplier scorecards, PO status and delivery ETA; line editor quantity/unit price/currency/landed cost. RFQ comparison side by side; three-way matching highlights discrepancies; partial receipts preserve remaining quantities.

### Sales and POS
Fast barcode-first POS with search/product grid, cart, customer, discounts, totals and payment panel. Split payments and returns reconcile original invoice; cashier closing compares expected and counted amounts.

### Finance
Ledger tables with account, date, source, debit, credit, running balance; journal editor balances before posting. Statements show as-of date, currency, hierarchy, comparison and drill-down. Reversal instead of editing posted journals; period locks and segregation of duties.

### HR
Attendance calendar, employee directory, profile tabs, payroll preview gross/deductions/net and approval history. Mask salaries by role; show policy inputs and calculation breakdown.

### CRM
Customer 360 with contact, vehicles, service history, invoices, consent, communication and complaints; pipeline Kanban and follow-up tasks. Campaign preview respects consent.

### Quality and assets
Inspection checklist with pass/fail/not applicable, evidence and mandatory failure reason; warranty claim linked to original job. Equipment register shows assignment, calibration and maintenance due dates.

### Reporting
Report hub by domain; searchable report catalog, filter drawer, KPI strip, charts, data grid, totals, drill-down, export jobs and freshness label. Custom report builder uses allowlisted fields and dimensions.

### Commerce
Order fulfillment board with payment and delivery status, line items, reservations, returns and refunds; publishing editor previews customer-facing product.

### Administration
Role-permission matrix with scoped access, approval threshold editor, feature flags, audit filters and session revocation; warn on destructive changes and require appropriate authorization.

## Mobile signature experiences
Customer home: vehicle hero with real vehicle data, upcoming service, active repair status and quick actions. Booking is a stepper with branch, service, slot, problem and confirmation; repair timeline uses actual status events, quote approval shows revision and amount; shop shows fitment, stock, product photos and transparent checkout totals. Payment status must be verified by backend. Manager home: revenue hero, gross/net profit, four operational KPIs, branch/date filters and prioritized approvals. Approval detail shows requester, amount, source record, impact, policy and approve/reject with reason; reject stale versions and self-approval, step-up authentication where required. Offline mode read-only with freshness indicator; never queue financial or stock mutations offline.

## Complete screen catalog

### Web — Executive
| ID | View |
|---|---|
| WEB-001 | Executive overview |
| WEB-002 | Business performance comparison |
| WEB-003 | Branch performance |
| WEB-004 | Revenue and profitability analysis |
| WEB-005 | Operational KPI dashboard |
| WEB-006 | Business alerts center |
| WEB-007 | Executive approval center |

### Web — Workshop
| ID | View |
|---|---|
| WEB-008 | Workshop overview |
| WEB-009 | Live repair Kanban board |
| WEB-010 | Appointment calendar |
| WEB-011 | Create service appointment |
| WEB-012 | Vehicle registry |
| WEB-013 | Vehicle profile and service history |
| WEB-014 | Vehicle check-in |
| WEB-015 | Initial inspection and photographs |
| WEB-016 | Diagnosis and fault codes |
| WEB-017 | Create repair quotation |
| WEB-018 | Quotation details and approval history |
| WEB-019 | Job card management |
| WEB-020 | Job card details |
| WEB-021 | Technician assignment |
| WEB-022 | Workshop bay allocation |
| WEB-023 | Labor time tracking |
| WEB-024 | Spare parts reservation and issuance |
| WEB-025 | Additional repair requests |
| WEB-026 | Repair progress and ETA |
| WEB-027 | Outsourced repair services |
| WEB-028 | Final inspection |
| WEB-029 | Vehicle delivery |
| WEB-030 | Job profitability analysis |
| WEB-031 | Warranty management |

### Web — Spare parts
| ID | View |
|---|---|
| WEB-032 | Spare parts dashboard |
| WEB-033 | Product catalog |
| WEB-034 | Create and edit spare part |
| WEB-035 | Product details |
| WEB-036 | Categories and subcategories |
| WEB-037 | Manufacturers and brands |
| WEB-038 | OEM and alternative part numbers |
| WEB-039 | Vehicle compatibility |
| WEB-040 | Barcode management |
| WEB-041 | Product pricing |
| WEB-042 | Wholesale price lists |
| WEB-043 | Product bundles and kits |
| WEB-044 | Product image management |
| WEB-045 | Special-order requests |

### Web — Inventory
| ID | View |
|---|---|
| WEB-046 | Inventory dashboard |
| WEB-047 | Stock availability |
| WEB-048 | Warehouse management |
| WEB-049 | Storage locations and bins |
| WEB-050 | Stock movement history |
| WEB-051 | Goods receipt |
| WEB-052 | Stock issuance |
| WEB-053 | Stock reservation |
| WEB-054 | Warehouse transfer |
| WEB-055 | Transfer tracking |
| WEB-056 | Stock adjustments |
| WEB-057 | Physical stock counting |
| WEB-058 | Inventory discrepancies |
| WEB-059 | Damaged and quarantined stock |
| WEB-060 | Stock write-off |
| WEB-061 | Low-stock alerts |
| WEB-062 | Dead-stock analysis |
| WEB-063 | Inventory valuation |
| WEB-064 | Serial number tracking |
| WEB-065 | Landed cost allocation |

### Web — Procurement
| ID | View |
|---|---|
| WEB-066 | Procurement dashboard |
| WEB-067 | Supplier directory |
| WEB-068 | Supplier profile |
| WEB-069 | Purchase requisitions |
| WEB-070 | Request for quotation |
| WEB-071 | Supplier quotation comparison |
| WEB-072 | Purchase orders |
| WEB-073 | Create purchase order |
| WEB-074 | Purchase order details |
| WEB-075 | Purchase approval |
| WEB-076 | Incoming shipments |
| WEB-077 | Goods receiving and inspection |
| WEB-078 | Three-way invoice matching |
| WEB-079 | Purchase returns |
| WEB-080 | Supplier performance |

### Web — Sales and POS
| ID | View |
|---|---|
| WEB-081 | Sales dashboard |
| WEB-082 | Point of sale terminal |
| WEB-083 | Sales quotations |
| WEB-084 | Sales orders |
| WEB-085 | Wholesale orders |
| WEB-086 | Checkout and payment |
| WEB-087 | Split and partial payments |
| WEB-088 | Customer deposits |
| WEB-089 | Sales invoices |
| WEB-090 | Returns and refunds |
| WEB-091 | Discounts and promotions |
| WEB-092 | Customer credit limits |
| WEB-093 | Cashier shift opening |
| WEB-094 | Cashier shift closing |
| WEB-095 | Cash reconciliation |
| WEB-096 | Delivery management |
| WEB-097 | Sales commissions |

### Web — Finance
| ID | View |
|---|---|
| WEB-098 | Finance dashboard |
| WEB-099 | Chart of accounts |
| WEB-100 | General ledger |
| WEB-101 | Journal entries |
| WEB-102 | Create journal voucher |
| WEB-103 | Journal reversal |
| WEB-104 | Accounts receivable |
| WEB-105 | Accounts payable |
| WEB-106 | Customer statements |
| WEB-107 | Supplier statements |
| WEB-108 | Receivables aging |
| WEB-109 | Payables aging |
| WEB-110 | Cash accounts |
| WEB-111 | Bank accounts |
| WEB-112 | Bank reconciliation |
| WEB-113 | Payment vouchers |
| WEB-114 | Receipt vouchers |
| WEB-115 | Expense management |
| WEB-116 | Petty cash |
| WEB-117 | Fixed assets |
| WEB-118 | Depreciation |
| WEB-119 | Cost centers |
| WEB-120 | Budget management |
| WEB-121 | Budget versus actual |
| WEB-122 | Trial balance |
| WEB-123 | Profit and loss |
| WEB-124 | Balance sheet |
| WEB-125 | Cash flow statement |
| WEB-126 | Financial period closing |
| WEB-127 | Tax configuration |
| WEB-128 | Currency and exchange rates |
| WEB-129 | Credit and debit notes |
| WEB-130 | Work in progress accounting |
| WEB-131 | Opening balances |
| WEB-132 | Accruals and prepayments |
| WEB-133 | Financial reconciliation |
| WEB-134 | Intercompany transactions |

### Web — HR
| ID | View |
|---|---|
| WEB-135 | HR dashboard |
| WEB-136 | Employee directory |
| WEB-137 | Employee profile |
| WEB-138 | Employee onboarding |
| WEB-139 | Contracts and documents |
| WEB-140 | Organizational structure |
| WEB-141 | Attendance management |
| WEB-142 | Shift scheduling |
| WEB-143 | Leave management |
| WEB-144 | Overtime management |
| WEB-145 | Payroll dashboard |
| WEB-146 | Payroll calculation |
| WEB-147 | Salary components |
| WEB-148 | Allowances and deductions |
| WEB-149 | Loans and advances |
| WEB-150 | Payslips |
| WEB-151 | Payroll approval |
| WEB-152 | Performance evaluations |
| WEB-153 | Technician productivity |
| WEB-154 | Employee document expiration |
| WEB-155 | Employee self-service |
| WEB-156 | End-of-service calculation |
| WEB-157 | Employee offboarding |

### Web — CRM
| ID | View |
|---|---|
| WEB-158 | CRM dashboard |
| WEB-159 | Customer directory |
| WEB-160 | Customer 360 profile |
| WEB-161 | Corporate customers |
| WEB-162 | Contact management |
| WEB-163 | Leads |
| WEB-164 | Sales opportunities |
| WEB-165 | Sales pipeline |
| WEB-166 | Communication history |
| WEB-167 | Follow-up tasks |
| WEB-168 | Customer complaints |
| WEB-169 | Customer feedback |
| WEB-170 | Customer segmentation |
| WEB-171 | Loyalty program |
| WEB-172 | Marketing campaigns |
| WEB-173 | Maintenance reminders |
| WEB-174 | Outstanding payment reminders |
| WEB-175 | Fleet contracts |

### Web — Quality and assets
| ID | View |
|---|---|
| WEB-176 | Quality dashboard |
| WEB-177 | Inspection templates |
| WEB-178 | Quality inspection execution |
| WEB-179 | Failed inspections |
| WEB-180 | Rework management |
| WEB-181 | Warranty claims |
| WEB-182 | Root cause analysis |
| WEB-183 | Supplier quality |
| WEB-184 | Equipment and tools registry |
| WEB-185 | Equipment assignment |
| WEB-186 | Preventive maintenance |
| WEB-187 | Calibration management |

### Web — Reporting
| ID | View |
|---|---|
| WEB-188 | Central reporting hub |
| WEB-189 | Financial reports |
| WEB-190 | Workshop reports |
| WEB-191 | Inventory reports |
| WEB-192 | Sales reports |
| WEB-193 | Procurement reports |
| WEB-194 | HR reports |
| WEB-195 | CRM reports |
| WEB-196 | E-commerce reports |
| WEB-197 | Quality reports |
| WEB-198 | Audit reports |
| WEB-199 | Dynamic report builder |
| WEB-200 | Pivot table designer |
| WEB-201 | Custom dashboard builder |
| WEB-202 | KPI drill-down |
| WEB-203 | Historical period comparison |
| WEB-204 | Scheduled reports |
| WEB-205 | Export and download center |
| WEB-206 | Report templates |
| WEB-207 | Report reconciliation |

### Web — Commerce
| ID | View |
|---|---|
| WEB-208 | Online store dashboard |
| WEB-209 | Online product publishing |
| WEB-210 | Online orders |
| WEB-211 | Order details |
| WEB-212 | Order fulfillment |
| WEB-213 | Delivery tracking |
| WEB-214 | Online returns |
| WEB-215 | Shopping cart analytics |
| WEB-216 | Online promotions |
| WEB-217 | Customer app content management |

### Web — Administration
| ID | View |
|---|---|
| WEB-218 | Login |
| WEB-219 | Password recovery |
| WEB-220 | MFA verification |
| WEB-221 | User profile |
| WEB-222 | Company configuration |
| WEB-223 | Branch configuration |
| WEB-224 | User management |
| WEB-225 | Role management |
| WEB-226 | Permission matrix |
| WEB-227 | Approval workflow configuration |
| WEB-228 | Feature management |
| WEB-229 | Notification configuration |
| WEB-230 | Document templates |
| WEB-231 | Audit logs |
| WEB-232 | Active sessions |
| WEB-233 | Integration settings |
| WEB-234 | Data import and export |
| WEB-235 | Branding and localization |
| WEB-236 | System health |
| WEB-237 | Global search |

### CUS mobile application
| ID | View |
|---|---|
| CUS-001 | Splash |
| CUS-002 | Onboarding |
| CUS-003 | Login |
| CUS-004 | Registration |
| CUS-005 | OTP |
| CUS-006 | Biometrics |
| CUS-007 | Home |
| CUS-008 | Notifications |
| CUS-009 | Offers |
| CUS-010 | Branch locator |
| CUS-011 | Vehicle list |
| CUS-012 | Vehicle details |
| CUS-013 | Add vehicle |
| CUS-014 | VIN entry |
| CUS-015 | Service history |
| CUS-016 | Documents |
| CUS-017 | Maintenance schedule |
| CUS-018 | Service catalog |
| CUS-019 | Service details |
| CUS-020 | Branch selection |
| CUS-021 | Appointment slots |
| CUS-022 | Problem description |
| CUS-023 | Photo upload |
| CUS-024 | Confirmation |
| CUS-025 | Manage booking |
| CUS-026 | Active repairs |
| CUS-027 | Repair details |
| CUS-028 | Diagnosis |
| CUS-029 | Quotation |
| CUS-030 | Quotation approval |
| CUS-031 | Additional approval |
| CUS-032 | Repair timeline |
| CUS-033 | Inspection results |
| CUS-034 | Store |
| CUS-035 | Categories |
| CUS-036 | Search |
| CUS-037 | Vehicle compatibility |
| CUS-038 | Product details |
| CUS-039 | Comparison |
| CUS-040 | Favorites |
| CUS-041 | Special orders |
| CUS-042 | Stock alerts |
| CUS-043 | Cart |
| CUS-044 | Delivery address |
| CUS-045 | Pickup selection |
| CUS-046 | Installation booking |
| CUS-047 | Checkout |
| CUS-048 | Payment |
| CUS-049 | Confirmation |
| CUS-050 | Order history |
| CUS-051 | Order details |
| CUS-052 | Delivery tracking |
| CUS-053 | Return request |
| CUS-054 | Refund status |
| CUS-055 | Invoices |
| CUS-056 | Invoice details |
| CUS-057 | Deposits |
| CUS-058 | Payment history |
| CUS-059 | Receipts |
| CUS-060 | Loyalty |
| CUS-061 | Rewards |
| CUS-062 | Support chat |
| CUS-063 | Complaints |
| CUS-064 | Ratings |
| CUS-065 | Warranty |
| CUS-066 | Profile |
| CUS-067 | Preferences |
| CUS-068 | Language |
| CUS-069 | Security |
| CUS-070 | Privacy |
| CUS-071 | Account deletion |

### MGR mobile application
| ID | View |
|---|---|
| MGR-001 | Login |
| MGR-002 | MFA |
| MGR-003 | Biometrics |
| MGR-004 | Company selection |
| MGR-005 | Overview |
| MGR-006 | Revenue |
| MGR-007 | Gross profit |
| MGR-008 | Net profit |
| MGR-009 | Branch comparison |
| MGR-010 | Cash flow |
| MGR-011 | KPI details |
| MGR-012 | Business alerts |
| MGR-013 | Workshop overview |
| MGR-014 | Active jobs |
| MGR-015 | Job details |
| MGR-016 | Overdue jobs |
| MGR-017 | Technician assignments |
| MGR-018 | Capacity |
| MGR-019 | Job profitability |
| MGR-020 | Quality failures |
| MGR-021 | Stock overview |
| MGR-022 | Product availability |
| MGR-023 | Valuation |
| MGR-024 | Low stock |
| MGR-025 | Dead stock |
| MGR-026 | Warehouse comparison |
| MGR-027 | Discrepancies |
| MGR-028 | Purchase requests |
| MGR-029 | Purchase orders |
| MGR-030 | Order details |
| MGR-031 | Incoming shipments |
| MGR-032 | Supplier performance |
| MGR-033 | Financial overview |
| MGR-034 | Receivables |
| MGR-035 | Payables |
| MGR-036 | Expenses |
| MGR-037 | Cash closing |
| MGR-038 | Bank balances |
| MGR-039 | Financial statements |
| MGR-040 | Budget variance |
| MGR-041 | Employee overview |
| MGR-042 | Attendance |
| MGR-043 | Productivity |
| MGR-044 | Leave |
| MGR-045 | Overtime |
| MGR-046 | Payroll |
| MGR-047 | Document expiration |
| MGR-048 | Customer overview |
| MGR-049 | Complaints |
| MGR-050 | Satisfaction |
| MGR-051 | Opportunities |
| MGR-052 | Fleet customers |
| MGR-053 | Approval inbox |
| MGR-054 | Purchase approval |
| MGR-055 | Stock adjustment |
| MGR-056 | Refund |
| MGR-057 | Discount |
| MGR-058 | Expense |
| MGR-059 | Payroll |
| MGR-060 | Credit limit |
| MGR-061 | Approval history |
| MGR-062 | Reports |
| MGR-063 | Report filters |
| MGR-064 | Drill-down |
| MGR-065 | Report details |
| MGR-066 | Downloads |
| MGR-067 | Profile |
| MGR-068 | Notifications |
| MGR-069 | Thresholds |
| MGR-070 | Delegation |
| MGR-071 | Security |
| MGR-072 | Language |

## Reporting excellence
Use ECharts on web, accessible native charts on mobile, AG Grid or TanStack Table (verify licenses), optional restricted Metabase. Reporting schema/views and materialized aggregates in PostgreSQL; Redis only for cache, BullMQ for exports. Define each KPI formula, source, grain, currency, timezone, inclusion/exclusion rules and freshness. Financial reports reconcile to posted journals; stock valuation reconciles to inventory ledger and GL. Provide P&L, balance sheet, cash flow, trial balance, AR/AP aging, job profitability, stock aging/turnover, sales margins, payroll and CRM performance. Filters, comparison, pivot, drill-down to source, saved templates, Excel/PDF/CSV, scheduled delivery and scoped export audit. Never silently show stale or partial data as final. Avoid arbitrary SQL in custom reports.

## Owner demonstration
Create isolated demo mode with deterministic relational fixtures: 3 branches, 3 warehouses, 26 employees, 150 customers, 200 vehicles, 500 parts, 100 repair jobs, 200 sales, 50 POs and 12 months of financial history. Use QAR and fictional identities. Derive totals from records; example revenue 425,000, direct costs 277,000, gross profit 148,000, expenses 55,500, net profit 92,500 only if fixtures reconcile. Demonstrate booking → check-in → diagnosis → quote approval → stock reservation → purchase approval if needed → repair → QC → invoice → simulated payment → journal → reporting. All three apps share demo state. Provide reset and role switching in demo only. No real payments, messages or external orders. Clearly label simulated data. Owner presentation mode should guide this journey without hiding operational complexity.

## Implementation sequence and deliverables
1. Audit repository and requirements; produce gap list and traceability matrix before coding. Preserve IDs and record unresolved policies.
2. Implement tokens, typography, components, responsive shell, role navigation and shared state patterns. Establish visual reference screenshots.
3. Implement executive dashboard, workshop, inventory, procurement, POS, finance and reporting first for owner demo; then remaining web modules and both mobile apps. Use reusable patterns without flattening domain differences.
4. Connect the demo workflow and reconcile fixtures. Keep demo adapters separate from production API adapters.
5. Capture all screen states using Playwright and mobile emulator/Maestro. Save screenshots by screen ID, theme and locale. Generate a browsable contact sheet/index. Review at desktop/tablet/mobile sizes; fix clipping, overflow, contrast, RTL and inconsistent spacing.
6. Deliver DESIGN_SYSTEM.md, SCREEN_CATALOG.md, NAVIGATION_MAP.md, COMPONENT_LIBRARY.md, REQUIREMENTS_TRACEABILITY.md, USER_JOURNEYS.md, UI_ACCEPTANCE_CRITERIA.md and STATUS.md. Traceability rows: requirement ID | screen/action | role | route | test | status | evidence. Track implemented vs planned; do not mark complete without evidence.

## Release gates
No broken routes or dead buttons; no unauthorized data exposure; no unlabelled mock transactions; no inconsistent financial totals; no missing critical loading/error/empty states. Test keyboard, screen reader, RTL, dark mode, mobile safe areas and network failures. Verify duplicate payment/stock requests, last-item concurrency, stale approvals, QC rework and report reconciliation against backend in production implementation. Run lint, typecheck, unit, integration and E2E tests; report actual results and blockers. Demo acceptance is not production acceptance.

## Start command for Claude Code
Read this document and the existing master specification. Inspect the repository, create the screen contracts and traceability matrix, then implement the design system and executive dashboard. Work in reviewable increments, maintain STATUS.md and capture evidence. Do not replace existing working features or skip requirements. Continue through the complete catalog, prioritizing the connected owner demonstration. Ask for decisions only when required; document assumptions and limitations.
