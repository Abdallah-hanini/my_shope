# Phase 1 plan — Identity, organization and accounting foundations

Gate (docs/ROADMAP.md): **tenant isolation, balanced journals, reversals**, plus scoped roles, audit, chart, periods, transactional posting, master data and migrations.

Phase 1 is delivered in several changes. Business decisions D-01…D-04 (docs/DECISIONS.md) are still open, so this phase builds only what is independent of them and records the assumptions in STATUS.md:

- The data model supports many companies; it does not assume how many legal entities exist or how they consolidate (D-02).
- Sign-in accepts tokens from **any standards-compliant OIDC provider** configured by environment; no provider is chosen (D-03). Without configuration every protected endpoint returns 401.
- The posting engine is generic (manual journals and reversals). No chart-of-accounts template, posting matrix, tax or FX is shipped (D-04, D-05, D-07).

| ID | Task | Depends on | Requirements | Acceptance tests | Status |
|---|---|---|---|---|---|
| P1-01 | ERD and migration review | P0 | DATA, ACC-001/002/008 | Reviewed doc `docs/ERD_PHASE1.md` | Done |
| P1-02 | Migration: org, iam, platform (audit, outbox, sequences), accounting (accounts, periods, journals) with DB-level constraints and triggers | P1-01 | ADM-001/002/007, ACC-001/002/008 | Integration: DB rejects unbalanced, mutated, cross-company and closed-period postings even when the API is bypassed | Done |
| P1-03 | OIDC bearer authentication (JWKS, issuer, audience, expiry) and user resolution | P1-02 | SEC-04 (partial), ADM-002 | Integration: missing/bad/expired/foreign tokens → 401; unknown or inactive user → 403 | Done |
| P1-04 | Scoped RBAC: company/branch role assignments, permission guard, no privilege escalation | P1-03 | ADM-002, SEC-03 | Integration: other company → 404; missing permission → 403; branch scope enforced; cannot grant more than you hold | Done |
| P1-05 | Audit (append-only, same transaction) and transactional outbox write | P1-02 | ADM-007, ARCH outbox | Integration: every mutation writes audit + outbox atomically; audit rows immutable | Done |
| P1-06 | Company, branch, user provisioning; bootstrap first platform admin (CLI) | P1-04 | ADM-001 | Integration + CLI run | Done |
| P1-07 | Chart of accounts (hierarchy, posting vs header accounts) | P1-04 | ACC-001 | Integration | Done |
| P1-08 | Fiscal periods: non-overlapping, close with optimistic locking; closed periods reject posting | P1-07 | ACC-008 | Integration incl. overlap and close-then-post | Done |
| P1-09 | Journal posting: idempotency key, gapless per-company numbering, decimal money with currency minor units, immutability, reversal | P1-08 | ACC-002 | Integration incl. concurrency (same key ×10, different keys ×20) | Done |
| P1-10 | Web ERP and manager app screens for companies, chart, periods and journals | P1-09, D-03 | ACC-001/002, ADM-011 | Playwright + jest-expo | **Next change** (needs an OIDC provider for interactive sign-in) |
| P1-11 | Outbox relay in the worker (publish, retry, dead-letter) | P1-05 | ARCH | Integration | Next change |
| P1-12 | Approval matrix / maker-checker for manual journals and restricted actions | P1-09, D-11 | ADM-003 | Integration incl. self-approval rejection | Next change (needs D-11 thresholds) |
| P1-13 | Opening balances import | P1-09, D-14 | ACC-014 | Integration | Blocked on D-14 |
