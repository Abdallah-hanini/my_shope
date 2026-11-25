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
