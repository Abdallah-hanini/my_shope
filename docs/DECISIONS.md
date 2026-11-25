# Decisions and open questions

## Blocking business decisions (owner input required)

None of these block Phase 0. Each blocks the listed production features; work on them stays disabled or synthetic until answered.

| # | Decision needed | Blocks | Needed by |
|---|---|---|---|
| D-01 | Jurisdiction(s) of operation and data residency (for example Qatar only, or GCC) | Hosting region, tax, payroll law, privacy/consent rules | Phase 1 |
| D-02 | Legal entity structure: how many companies, shared vs separate ledgers, intercompany policy | Company/branch model, consolidation, ACC-017 | Phase 1 |
| D-03 | Identity provider (OIDC): Keycloak self-hosted, Auth0, Entra ID, Cognito, … | Login on all 3 clients, MFA, step-up auth | Phase 1 |
| D-04 | Chart of accounts template and posting matrix sign-off by the accountant | ACC-001/002, every posting in docs/ACCOUNTING.md | Phase 1 |
| D-05 | Tax regime and rates (VAT applicability, effective dates) | ACC-010, invoices, POS | Phase 1–3 |
| D-06 | Inventory costing method: FIFO or weighted average, per company or per product | INV-010, COGS, stock valuation | Phase 2 |
| D-07 | Base currency, functional currencies and FX rate source | ACC-010, PRC-009 | Phase 1–2 |
| D-08 | Payment providers (card/online) and webhook model | POS-003, customer app checkout | Phase 3–4 |
| D-09 | SMS/OTP, email and push messaging vendors | Customer registration/OTP, CRM-003, notifications | Phase 4 |
| D-10 | Payroll law, end-of-service formula, leave rules | HR-005, HR-011, payroll posting | Phase 6 |
| D-11 | Approval thresholds and maker-checker matrix | ADM-003, discounts, refunds, POs, stock adjustments | Phase 1–3 |
| D-12 | Mobile app names, bundle identifiers, Apple/Google developer accounts | Store builds; current IDs are placeholders `com.example.erp.{customer,manager}` | Before Phase 4 device builds |
| D-13 | Supported iOS/Android versions and target devices | Mobile test matrix | Phase 4 |
| D-14 | Opening balances, initial catalog source and data migration scope | ACC-014, INV imports | Phase 1–2 |

## Technical decisions taken in Phase 0 (reversible)

| # | Decision | Why | Revisit when |
|---|---|---|---|
| T-01 | ERP lives in `erp/` inside the existing profile repository | Only repository available to this session; keeps the profile site untouched | Owner creates a dedicated repository (move `erp/` as-is; it has no dependency on the parent) |
| T-02 | Stable majors: Next 15.5, NestJS 11, Prisma 6.19, Expo SDK 54 (React Native 0.81, React 19.1.0), Node 22 | Mature, mutually compatible releases; React pinned once across web and mobile to avoid duplicate React in the hoisted install | Quarterly dependency review; newer majors (Next 16, Nest 12, Prisma 7/8, Expo 55+) exist and need a planned upgrade |
| T-03 | `node-linker=hoisted` in `.npmrc` | Most reliable Metro resolution for Expo in a pnpm monorepo | Expo isolated-install support is verified for this repo |
| T-04 | Shared packages compile to CommonJS `dist/` | One format consumable by Nest (CJS), Next and Metro without transpile config | Moving the API to ESM |
| T-05 | Express platform for Nest (not Fastify) | Default, widest middleware support (helmet etc.) | Load tests show a need |
| T-06 | Domain separation by PostgreSQL schema; Phase 0 migration creates empty schemas only | docs/ARCHITECTURE.md "Postgres schemas by domain" | Phase 1 ERD review (Prisma `multiSchema` for models in these schemas) |
| T-07 | API connects to DB/Redis lazily; readiness, not startup, reports dependency failures | API can start, report 503 and recover when dependencies return | — |
| T-08 | Integration tests live in separate Jest configs and **fail** (never skip) without services | Charter forbids skipped tests | — |
| T-09 | Customer app display name "Automotive Care", manager "Automotive Manager" | Placeholders | D-12 |
| T-10 | Worker readiness depends only on the queue Redis for now | Worker has no DB work until the outbox relay (Phase 1) | Phase 1 adds DB check |
