# Navigation map (current)

Navigation is filtered by role on the server (`apps/web-erp/src/lib/navigation.ts`). The API enforces the same permissions on every request.

```
/[locale]                                   Home: sign-in, company picker, system status
/[locale]/companies/new                     New company (platform administrator)
/[locale]/c/[companyId]                     Executive overview (reports.financial.read) or area links
  Workshop
    /jobs                                   Repair board (open jobs by status) · ?view=list · /jobs/new?vehicle= (check-in) · /jobs/[id]
    /appointments?branch=&date=             Appointment calendar (day view) → /appointments/new?branch=&start= · /appointments/[id] · /appointments/settings?branch= (hours)
    /jobs/[id]/print?doc=checkin|handover  Printable check-in / handover sheet (from the job card)
    /bays?branch=                           Bay board: car on each bay, jobs waiting, bay set-up (managers)
    /jobs/[id]/quotes/[quoteId]/print       Printed quotation (issued revisions)
    /jobs/[id]/invoices/[invoiceId]/print   Printed invoice or credit note
    /settings/posting                       Posting accounts (accountant)
    /parts?q=                               Parts catalogue with stock → /parts/[id] (stock per branch, receive, adjust, movements)
    /stock                                  Stock value reconciled to the ledger
    /special-orders?status=all              Parts ordered for jobs (waiting or all) → job card
    /suppliers                              Suppliers (owed, overdue) → /suppliers/[id] (bills, enter a bill, edit)
    /supplier-bills?status=all              Supplier bills by due date, reconciled to payables and goods received → /supplier-bills/[id] (pay, cancel)
    /settings/company                       Letterhead (CR no., address, phone, logo)
    /settings/tax                           Tax set-up (accountant)
    /settings/pricing                       Labour rates per branch, managers' discount limit
    /labour-time?from=&to=&branch=          Labour time report (managers); clocking is on the job card
    /vehicles                               Vehicle registry → /vehicles/[id] (profile, service history, check in)
    /customers                              Customers → /customers/[id] (vehicles, add vehicle)
  Finance
    /journals                               Journal list  → /journals/[id] (detail, reverse) · /journals/new
    /accounts                               Chart of accounts (create)
    /ledger?account=&from=&to=&branch=      General ledger (accounting.journal.read) → journal detail
    /trial-balance?from=&to=&branch=&zero=  Trial balance (reports.financial.read) → general ledger; Export
    /exports                                Export centre (either permission): request, status, download
      /exports/[id]/download                File (route handler; requester only, rechecked, audited)
    /periods                                Fiscal periods (create, close)
  Organization
    /branches                               Branches (create)
  Administration
    /users                                  Users and access: list, add staff (iam.assignment.read; adding needs iam.user.manage)
      /users/[userId]                       Profile: roles, reset password, deactivate/reactivate
    /roles                                  Roles: list, create (iam.role.read; editing needs iam.role.manage)
      /roles/[roleId]                       Edit or delete a role (system roles read-only)
    /permissions                            Permission matrix (read-only)
    /audit                                  Audit trail
/session/login | /session/callback | /session/refresh | POST /session/logout   (sign-in plumbing, not localized)
```

**Header**
- Breadcrumb: Home › Company › Section (derived from the URL in the browser).
- Notifications (company pages): bell with the unread count (refreshed on navigation and every 30 s) → `/[locale]/c/[id]/notifications` (All / Unread, Open, Mark all as read).
- Search (company pages): header box on wide screens, icon on phones and tablets → `/[locale]/c/[id]/search?q=`. `/` or Ctrl/⌘+K focuses it.
- Company switcher: companies where the user holds a role, plus "New company" for platform administrators.
- Language switch: keeps the current page.
- Profile menu: theme and sign out.

**Planned sidebar groups** (docs/SCREEN_CATALOG.md): Workshop, Spare parts, Inventory, Procurement, Sales & POS, HR, CRM, Quality, Reporting, Commerce, plus Administration (sessions). Each group appears only when its module and permissions exist.

**Mobile apps** (spec): customer tabs Home, Garage, Shop, Bookings, Profile (postponed by the owner). Manager tabs Home, Approvals, Reports, Alerts, More (planned, L-06).
