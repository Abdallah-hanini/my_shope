# Navigation map (current)

Navigation is filtered by role on the server (`apps/web-erp/src/lib/navigation.ts`). The API enforces the same permissions on every request.

```
/[locale]                                   Home: sign-in, company picker, system status
/[locale]/companies/new                     New company (platform administrator)
/[locale]/c/[companyId]                     Executive overview (reports.financial.read) or area links
  Finance
    /journals                               Journal list  → /journals/[id] (detail, reverse) · /journals/new
    /accounts                               Chart of accounts (create)
    /ledger?account=&from=&to=&branch=      General ledger (accounting.journal.read) → journal detail
    /trial-balance?from=&to=&branch=&zero=  Trial balance (reports.financial.read) → general ledger
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
- Search (company pages): header box on wide screens, icon on phones and tablets → `/[locale]/c/[id]/search?q=`. `/` or Ctrl/⌘+K focuses it.
- Company switcher: companies where the user holds a role, plus "New company" for platform administrators.
- Language switch: keeps the current page.
- Profile menu: theme and sign out.

**Planned sidebar groups** (docs/SCREEN_CATALOG.md): Workshop, Spare parts, Inventory, Procurement, Sales & POS, HR, CRM, Quality, Reporting, Commerce, plus Administration (sessions). Each group appears only when its module and permissions exist.

**Mobile apps** (spec): customer tabs Home, Garage, Shop, Bookings, Profile (postponed by the owner). Manager tabs Home, Approvals, Reports, Alerts, More (planned, L-06).
