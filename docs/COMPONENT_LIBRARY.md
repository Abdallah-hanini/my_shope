# Component library (web)

These are shadcn-style components: code owned in the repository and built on Radix primitives, with Lucide icons, `class-variance-authority`, `tailwind-merge` and `clsx`.

| Component | File | Notes |
|---|---|---|
| AppShell | `src/components/AppShell.tsx` | Sidebar or drawer, header, breadcrumbs, switchers, main landmark |
| DesktopSidebar / MobileNav | `src/components/shell/Sidebar.tsx` | 248/72 px, cookie-persisted collapse; Radix Dialog drawer below 1024 px |
| CompanySwitcher / ProfileMenu | `src/components/shell/Menus.tsx` | Radix DropdownMenu, RTL-aware |
| ThemeMenu | `src/components/shell/ThemeMenu.tsx` | Light, dark or system; applied without reload |
| PageHeader, Card, Notice, Badge, EmptyState, Field, Table (th/thNum/td/tdNum), Ltr, TextLink, button classes | `src/components/ui.tsx` | Token-based, logical properties |
| SimpleForm | `src/components/SimpleForm.tsx` | Server-action form with field and form errors, preserved values, pending state |
| JournalForm | `src/components/JournalForm.tsx` | Dynamic lines, exact totals, idempotency key |
| KpiCard | `src/components/dashboard/KpiCard.tsx` | Label, exact value, currency, sub-line, tone |
| TrendChart | `src/components/dashboard/charts.tsx` | Lazily loaded ECharts (SVG), themed from CSS variables, decorative with an adjacent table |
| ProblemNotice | `src/components/ProblemNotice.tsx` | Renders RFC 9457 problems (403, 404, network, detail) |

Shared packages:
- `@erp/design-tokens`: tokens with contrast tests.
- `@erp/localization`: catalogues, `groupDigits`, date formatting.
- `@erp/validation`: schemas, minor-unit money helpers.
- `@erp/web-ui` and `@erp/mobile-ui`: mobile-ui will be restyled with the AUTO360 tokens when the manager app is built.
