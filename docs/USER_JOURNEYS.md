# User journeys

## Implemented (verified by `scripts/e2e-web.mjs` and `deploy/scripts/verify-deployment.mjs`)

1. **Owner first sign-in.**
   - An administrator is created with `add-admin.ps1`.
   - The owner opens the shop URL and selects Sign in, which opens Keycloak.
   - Keycloak asks for a new password and authenticator enrolment, then returns to the company picker.
2. **Set up the books.**
   - Create the company, then branches.
   - Build the chart of accounts with header and posting accounts; set reporting classes for cash, bank and COGS.
   - Create fiscal periods.
3. **Record and correct.**
   - Post a journal: the form shows a running balance and the server confirms.
   - Open its detail.
   - Reverse a mistaken journal with a reason; both journals are linked.
4. **Month end.** Close the period with a reason; later postings into it are refused. Every action appears in the audit trail.
5. **Executive review.**
   - Open the executive overview and choose a period and branch.
   - Read the KPIs and trend.
   - Follow "Needs attention" items to the periods page or the journal.
6. **Switch language and theme.** Arabic RTL or English, and light, dark or system, from any page.
7. **Sign out.** Ends both the ERP session and the Keycloak session.

## Planned: owner demonstration (spec "Owner demonstration")

Booking → check-in → diagnosis → quote approval → stock reservation → purchase approval → repair → QC → invoice → simulated payment → journal → reporting.

This needs the workshop, inventory, procurement and POS modules (phases 2–3). It will run in an **isolated demo environment** with deterministic, clearly labelled synthetic fixtures and separate demo adapters, and will never share the production database. Recorded in docs/DECISIONS.md.
