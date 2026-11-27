# AUTO360 design system

The source of truth for values is `packages/design-tokens/src/index.ts`, whose tests check WCAG contrast. The web CSS variables in `apps/web-erp/src/app/globals.css` mirror it. The specification is docs/spec/AUTO360_UI_UX_MASTER_DESIGN.md.

## Colour tokens (identity v2, 2026-12-01)

Graphite neutrals with one petrol accent; see docs/UI_TRANSFORMATION.md for the reasoning. Every text/background pair is ≥ 4.5:1 (tested in `packages/design-tokens`), and a web test keeps `globals.css` identical to the package.

| Token | Light | Dark |
|---|---|---|
| background | #F5F6F8 | #0D1014 |
| surface | #FFFFFF | #14181E |
| surfaceMuted | #F0F2F5 | #1B2028 |
| surfaceRaised | #FFFFFF | #1A1F27 |
| text | #14171F | #E7E9ED |
| textMuted | #555B69 | #9EA5B1 |
| border | #E3E6EB | #262C35 |
| borderStrong | #CFD4DC | #353C47 |
| primary | #0B6680 | #5CC2DB |
| primaryHover | #095368 | #7FD0E3 |
| primarySoft | #E6F2F5 | #14303A |
| onPrimary | #FFFFFF | #06191F |
| sidebar | #FBFBFC | #101318 |
| sidebarText | #1F2430 | #E7E9ED |
| sidebarMuted | #5D6371 | #949BA7 |
| sidebarActive | #E6F2F5 | #16313A |
| success | #0E6F48 | #4ADE9B |
| successBg | #E9F6EF | #0C2A1D |
| successBrand | #12A06A | #22C380 |
| danger | #A91F27 | #F7A1A4 |
| dangerBg | #FDEEEE | #2E1012 |
| dangerBrand | #DC3B42 | #EF5359 |
| warning | #7F4C00 | #F5C062 |
| warningBg | #FDF4E3 | #2B2008 |
| warningBrand | #E09B1A | #E9A23B |
| info | #1D4F91 | #9CC3F5 |
| infoBg | #ECF2FB | #14233A |

- Semantic **text** colours are darker (light theme) or lighter (dark theme) than the brand colours so text reaches 4.5:1; brand colours are for icons, borders and chart series.
- Dark mode has its own tuned values, not inverted colours.
- The theme is light, dark or system, stored in the `erp_theme` cookie and applied before first paint.

## Typography

- Fonts: Inter (variable) for Latin and IBM Plex Sans Arabic (400–700) for Arabic. Both are self-hosted through `@fontsource`, so the shop PC needs no internet for them.
- Sizes: page titles 24/32, section titles 15, body 14, labels 13, table headers 12 (sentence case).
- Money and identifiers use tabular numerals (`.tabular`) and are wrapped `dir="ltr"`.
- Amounts are shown as exact decimal strings with thousands separators (`groupDigits`); they are never converted to floating point (T-27).

## Spacing and shape

- 4/8 px grid. Card padding 20 px, content padding 24 px (16 px on phones).
- Radii: 8 px for controls (`--radius-control`), 10 px for cards (`--radius-card`). Hairline borders, near-flat card shadow; raised shadow only for menus and drawers. Motion is restrained and disabled under `prefers-reduced-motion`.

## Layout

- **Sidebar:** light, 244 px expanded or 68 px collapsed on desktop (≥ 1024 px). The preference is kept in the `erp_sidebar` cookie. Below 1024 px it becomes a drawer from the start edge.
- **Header:** 56 px, sticky, translucent. Contains breadcrumbs (≥ 768 px), the page title on phones, the company switcher (≥ 640 px), the language switch and the profile menu.
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
