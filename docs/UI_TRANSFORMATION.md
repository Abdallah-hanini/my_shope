# AUTO360 UI/UX transformation

The owner asked for a commercial-grade UI/UX transformation of the whole product (2026-12-01). Per the charter ("do not attempt all phases in one change") it is delivered in reviewed slices. Each slice keeps every API contract, business rule, permission and test intact, and passes the full gate before it is committed. This file is the audit, the identity decisions and the per-screen tracker.

## 1. Audit (before)

| # | Finding | Effect | Slice |
|---|---|---|---|
| A1 | Stock Tailwind slate + blue palette and a heavy dark-navy sidebar | Reads like a generic admin template, not a product | 1 |
| A2 | Page titles 28 px, 15 px body, tall nav items (40 px) | Low information density; Finance, Organization and Administration fall below the fold on a laptop | 1 |
| A3 | Breadcrumb repeats Home and the company (already in the company switcher) and truncates ("Ho… › E2E… › Tax set…") | The current page is hard to read | 1 |
| A4 | 15 screens defined their own label style; five radii in use (`rounded-md/lg/xl`); header controls styled one by one | Inconsistent forms and controls | 1 |
| A5 | No loading state between pages; the error screen is a bare red box | The app feels frozen on slow links; failures look broken | 1 (error), 2 (in-page skeletons) |
| A6 | Empty states are a grey sentence without guidance or a next step | New customers do not know what to do | 1–2 |
| A7 | Job board: fixed narrow columns, later columns (Ready) cut off, no status cue | Advisors scroll sideways to find ready cars | 1 |
| A8 | View switchers built per page (ghost buttons, underlined links) | Four different tab styles | 1 |
| A9 | Long record pages (job card ≈ 3 500 px) as one column of cards; most forms are a single row of inline controls | Frequent tasks need scrolling; actions compete | 2 |
| A10 | Lists have no filters beyond a search box on some pages; no sorting | Experienced staff cannot narrow long lists | 2–3 |
| A11 | No keyboard shortcut beyond "/" for search; no command palette | Power users are slowed down | 3 |
| A12 | Mobile apps (customer, manager) are sign-in shells | Not part of this web transformation; tracked in docs/MOBILE.md | later |

Strengths kept: semantic CSS variables with tested contrast; light, dark and system themes; complete RTL with logical properties; accessible tables (captions, scope); skip link and landmarks; no mock data; server-side permissions.

## 2. Identity v2 (decisions)

- **Character:** calm, precise and workshop-practical. One accent colour, graphite neutrals, hairline borders, very little shadow; colour is reserved for status and the primary action.
- **Accent "petrol"** `#0B6680` (dark theme `#5CC2DB`), with hover and soft-tint variants. It suits automotive work and is not the default framework blue.
- **Neutrals:** canvas `#F5F6F8`, surfaces white, text `#14171F`, muted `#555B69`, borders `#E3E6EB` / strong `#CFD4DC`. Dark theme has its own tuned palette (not inverted).
- **Status:** success, warning, danger and a new info tone, each with a text, tint and brand value. Every text/background pair is ≥ 4.5:1, enforced by `packages/design-tokens` tests. A web test keeps `globals.css` identical to the token package.
- **Type:** Inter (Latin, with `cv11 ss01 ss03`) and IBM Plex Sans Arabic. Page titles 24/32, section titles 15, body 14, labels 13, table headers 12 sentence case (not shouting uppercase).
- **Shape:** controls 8 px, cards 10 px; 4/8 px spacing grid; header 56 px; sidebar 244 px expanded / 68 px collapsed; content 28 px gutters (16 px on phones).
- **Navigation:** a light sidebar with compact items (36 px), an active state as accent-tinted text and icon, quiet group labels, and dividers when collapsed. The breadcrumb starts at the company inside a company; the current page never truncates.
- **Motion:** 150 ms colour and shadow transitions only; skeleton pulse is disabled under reduced motion.

## 3. Component library (`apps/web-erp/src/components/ui.tsx`)

Existing exports keep their names and props, so every screen picks up the new design at once:

- **Existing, restyled:** PageHeader, Card, Notice, EmptyState, Table/th/td, Badge, Ltr, Field, inputClass, buttonPrimary/Secondary/Ghost.
- **New:**
  - PageHeader `eyebrow` and `back` link; Card `description`;
  - `Grid` and `SplitLayout` (record page with a side column);
  - `Tabs` (link tabs with counts);
  - `DescriptionList`;
  - Notice `info`; EmptyState `title`, `icon` and `action`;
  - `Skeleton`;
  - `buttonDanger` and `buttonSm`;
  - `fieldLabel` (one label style for every inline form).
- **Shell:** sidebar, header controls (search, company, language, bell, profile) on one control style; a centred error card with a retry action; an "On this page" bar of section links on the job card (only sections present are offered; the one in view is marked).
- **Not adopted:** a route-level `loading.tsx` skeleton. With it, a form's redirect back to the same page (Next.js 15.5) stayed on "Saving…" (the browser test caught it on the chart of accounts). Skeletons will be used inside pages instead.

## 4. Screen tracker

Status: ✅ done in this slice · ◐ restyled through shared components (layout pass pending) · ☐ not started.

| Area | Screen | Route | Status |
|---|---|---|---|
| Shell | Sidebar, header, breadcrumb, error | all company pages | ✅ |
| Home | Sign-in / company list | `/` | ◐ |
| Home | New company | `/companies/new` | ◐ |
| Dashboard | Executive overview | `/c/[id]` | ◐ |
| Workshop | Job board / list | `/jobs` | ✅ only statuses with jobs get a column; empty statuses fold into a chip row; status cue; tabs; empty state with "New job card" |
| Workshop | New job (check-in) | `/jobs/new` | ◐ |
| Workshop | Job card | `/jobs/[id]` | ✅ section bar, sticky actions column (A9 partly) |
| Workshop | Printouts (job, quote, invoice) | `…/print` | unchanged by design (paper) |
| Workshop | Appointments (day, new, detail, settings) | `/appointments…` | ◐ |
| Workshop | Bays | `/bays` | ◐ |
| Workshop | Labour time | `/labour-time` | ◐ |
| CRM | Customers, customer | `/customers…` | ✅ header "New customer"; record page with vehicles in the main column, details and edit in a side column |
| CRM | Vehicles, vehicle | `/vehicles…` | ✅ record page: service history main, owner/details and edit side |
| Inventory | Parts, part | `/parts…` | ✅ header "Add part"; part page: stock per branch and movements main, price and edit side |
| Inventory | Stock value | `/stock` | ◐ |
| Inventory | Special orders | `/special-orders` | ✅ tabs |
| Inventory | Transfers, transfer | `/transfers…` | ✅ tabs; transfer page: parts main, confirm/cancel side |
| Purchasing | Suppliers, supplier | `/suppliers…` | ✅ header "Add supplier"; supplier page: bill entry and bills main, details and edit side |
| Purchasing | Supplier bills, bill | `/supplier-bills…` | ✅ tabs; bill page: deliveries, payments and cancel main, totals side |
| Finance | Journals, journal, new journal | `/journals…` | ◐ |
| Finance | Chart of accounts | `/accounts` | ✅ list first, "Add account" in the header |
| Finance | General ledger | `/ledger` | ◐ |
| Finance | Trial balance | `/trial-balance` | ◐ |
| Finance | Export centre | `/exports` | ◐ |
| Finance | Fiscal periods | `/periods` | ✅ list first, "Add period" in the header |
| Organization | Branches | `/branches` | ✅ list first, "Add branch" in the header |
| Organization | Company profile, tax, posting, pricing | `/settings/…` | ◐ |
| Administration | Users, user | `/users…` | ✅ list first, "Add staff member" in the header |
| Administration | Roles, role, permission matrix | `/roles…`, `/permissions` | ✅ "New role" in the header (matrix ◐) |
| Administration | Audit trail | `/audit` | ◐ |
| Header | Search, notifications | `/search`, `/notifications` | ✅ tabs (notifications) |

## 5. Slice 2a (done)

- Empty states on 27 screens carry an icon; parts and suppliers offer a jump to their add form, and the job list offers "New job card".
- Page headers: the title keeps at least 18rem (or the full width), so on phones the actions wrap below it instead of squeezing the title (seen on the Arabic trial balance).
- Job board: statuses without jobs collapse into one chip row, so every job is in view without sideways scrolling.

## 6. Slice 2b (done)

- **One rule for lists:** the list comes first; the create form follows; a primary "Add …" button in the page header jumps to it (`JumpAction`). Applied to customers, parts, suppliers, roles, chart of accounts, branches, users and fiscal periods.
- **One rule for record pages:** the work (vehicles, service history, stock, bills, deliveries, payments, transfer lines) in the main column; the record's facts (`DescriptionList`) and its edit form in a 340 px side column from 1280 px (stacked below). Applied to customer, vehicle, part, supplier, supplier bill and transfer pages.
- Inline forms use 12 px spacing between fields and rows.

## 7. Next slices

- **Slice 2:**
  - record-page layout with a side column (job card first, then part, supplier, bill, customer, vehicle);
  - grouped forms (form sections instead of single rows);
  - empty states with next steps on every list;
  - page header actions for the primary task of each list.
- **Slice 3:**
  - list filters and sorting (server-side, from the existing query parameters);
  - a keyboard command palette;
  - dashboard refinement (KPI hierarchy, chart styling);
  - an automated accessibility scan (axe) in the browser test.
- **Mobile apps:** a separate track (docs/MOBILE.md), sharing the same tokens.
