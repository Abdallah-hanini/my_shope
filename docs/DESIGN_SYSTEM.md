# AUTO360 design system

The source of truth for values is `packages/design-tokens/src/index.ts`, whose tests check WCAG contrast. The web CSS variables in `apps/web-erp/src/app/globals.css` mirror it. The specification is docs/spec/AUTO360_UI_UX_MASTER_DESIGN.md.

## Colour tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| background (canvas) | #F8FAFC | #0B1220 | page |
| surface | #FFFFFF | #111A2E | cards, header, inputs |
| surfaceMuted | #F1F5F9 | #162036 | table headers, hover |
| text | #101828 | #E2E8F0 | body |
| textMuted | #475569 | #94A3B8 | labels, secondary |
| border | #E2E8F0 | #1E293B | dividers |
| primary | #2563EB | #60A5FA | actions, links, active nav |
| onPrimary | #FFFFFF | #0B1220 | text on primary |
| sidebar / sidebarActive | #101828 / #1E293B | #070C17 / #16213A | navigation |
| success / bg / brand | #047857 / #ECFDF5 / #059669 | #34D399 / #052E26 / #10B981 | text / tint / icons and charts |
| warning / bg / brand | #92400E / #FFFBEB / #D97706 | #FCD34D / #2A1E05 / #F59E0B | |
| danger / bg / brand | #B91C1C / #FEF2F2 / #DC2626 | #FCA5A5 / #2A0A0A / #EF4444 | |

- Semantic **text** colours are darker (light theme) or lighter (dark theme) than the brand colours, as the spec allows, so text reaches 4.5:1. Brand colours are used for icons, borders and chart series.
- Dark mode has its own tokens rather than inverted colours.
- The theme is light, dark or system, stored in the `erp_theme` cookie and applied before first paint.

## Typography

- Fonts: Inter (variable) for Latin and IBM Plex Sans Arabic (400–700) for Arabic. Both are self-hosted through `@fontsource`, so the shop PC needs no internet for them.
- Sizes: headings 28/24/20, body 14–15, labels 12–13.
- Money and identifiers use tabular numerals (`.tabular`) and are wrapped `dir="ltr"`.
- Amounts are shown as exact decimal strings with thousands separators (`groupDigits`); they are never converted to floating point (T-27).

## Spacing and shape

- 4/8 px grid. Card padding 20 px, content padding 24 px (16 px on phones).
- Radii: 8 px for controls, 12 px for cards. Subtle card shadow. Motion is restrained and disabled under `prefers-reduced-motion`.

## Layout

- **Sidebar:** 248 px expanded or 72 px collapsed on desktop (≥ 1024 px). The preference is kept in the `erp_sidebar` cookie. Below 1024 px it becomes a drawer from the start edge.
- **Header:** 64 px, sticky. Contains breadcrumbs (≥ 768 px), the page title on phones, the company switcher (≥ 640 px), the language switch and the profile menu.
- **Content:** maximum width 1400 px.
- **Breakpoints checked:** 1440×900, 768×1024, 390×844. The browser test asserts no horizontal page scroll at 390 px; wide tables scroll inside their card.

## RTL

- `dir` comes from the URL locale. Logical properties (`ms-`, `ps-`, `start-`, `text-start`) are used throughout, and directional icons are mirrored (`rtl:-scale-x-100`).
- Codes, numbers and dates are isolated as left-to-right.
- Charts keep a left-to-right time axis in both languages, and the legend starts at the reading edge (T-28).

## Accessibility (WCAG 2.2 AA target)

- Skip link and landmarks: navigation "Main navigation", breadcrumb, main.
- Visible 2 px focus ring. Interactive targets at least 40 px on desktop and 44 px for mobile controls.
- Labels are tied to inputs, errors use `aria-describedby`, and live regions announce journal totals.
- Every chart has an adjacent data table.
- Not yet automated: an axe scan in CI (planned).

## Rules

- No dead buttons: global search and the notification inbox (spec "Web shell") stay hidden until they exist, and are listed as WEB-237 and planned in docs/SCREEN_CATALOG.md.
- No mock data in production screens. The demo mode in the spec will be an isolated, clearly labelled environment (docs/DECISIONS.md).
