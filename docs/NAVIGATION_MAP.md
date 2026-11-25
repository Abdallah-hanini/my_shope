# Navigation map (current)

Navigation is filtered by role on the server (`apps/web-erp/src/lib/navigation.ts`). The API enforces the same permissions on every request.

```
/[locale]                                   Home: sign-in, company picker, system status
/[locale]/companies/new                     New company (platform administrator)
/[locale]/c/[companyId]                     Executive overview (reports.financial.read) or area links
  Finance
    /journals                               Journal list  → /journals/[id] (detail, reverse) · /journals/new
    /accounts                               Chart of accounts (create)
    /periods                                Fiscal periods (create, close)
  Organization
    /branches                               Branches (create)
  Administration
    /audit                                  Audit trail
/session/login | /session/callback | /session/refresh | POST /session/logout   (sign-in plumbing, not localized)
```

**Header**
- Breadcrumb: Home › Company › Section.
- Company switcher: companies where the user holds a role, plus "New company" for platform administrators.
- Language switch: keeps the current page.
- Profile menu: theme and sign out.

**Planned sidebar groups** (docs/SCREEN_CATALOG.md): Workshop, Spare parts, Inventory, Procurement, Sales & POS, HR, CRM, Quality, Reporting, Commerce, plus Administration (users, roles, permission matrix, sessions). Each group appears only when its module and permissions exist.

**Mobile apps** (spec): customer tabs Home, Garage, Shop, Bookings, Profile (postponed by the owner). Manager tabs Home, Approvals, Reports, Alerts, More (planned, L-06).
