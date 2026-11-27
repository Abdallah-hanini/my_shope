/**
 * AUTO360 palette (docs/DESIGN_SYSTEM.md, identity v2): graphite neutrals with one petrol accent. Semantic text colours are darker
 * (light) or lighter (dark) than the brand semantic colours so text meets WCAG AA on its
 * background; the brand colours are kept for icons, chart series and borders.
 */
export const palette = {
  light: {
    background: '#f5f6f8',
    surface: '#ffffff',
    surfaceMuted: '#f0f2f5',
    surfaceRaised: '#ffffff',
    text: '#14171f',
    textMuted: '#555b69',
    border: '#e3e6eb',
    borderStrong: '#cfd4dc',
    primary: '#0b6680',
    primaryHover: '#095368',
    primarySoft: '#e6f2f5',
    onPrimary: '#ffffff',
    sidebar: '#fbfbfc',
    sidebarText: '#1f2430',
    sidebarMuted: '#5d6371',
    sidebarActive: '#e6f2f5',
    success: '#0e6f48',
    successBg: '#e9f6ef',
    successBrand: '#12a06a',
    danger: '#a91f27',
    dangerBg: '#fdeeee',
    dangerBrand: '#dc3b42',
    warning: '#7f4c00',
    warningBg: '#fdf4e3',
    warningBrand: '#e09b1a',
    info: '#1d4f91',
    infoBg: '#ecf2fb',
  },
  dark: {
    background: '#0d1014',
    surface: '#14181e',
    surfaceMuted: '#1b2028',
    surfaceRaised: '#1a1f27',
    text: '#e7e9ed',
    textMuted: '#9ea5b1',
    border: '#262c35',
    borderStrong: '#353c47',
    primary: '#5cc2db',
    primaryHover: '#7fd0e3',
    primarySoft: '#14303a',
    onPrimary: '#06191f',
    sidebar: '#101318',
    sidebarText: '#e7e9ed',
    sidebarMuted: '#949ba7',
    sidebarActive: '#16313a',
    success: '#4ade9b',
    successBg: '#0c2a1d',
    successBrand: '#22c380',
    danger: '#f7a1a4',
    dangerBg: '#2e1012',
    dangerBrand: '#ef5359',
    warning: '#f5c062',
    warningBg: '#2b2008',
    warningBrand: '#e9a23b',
    info: '#9cc3f5',
    infoBg: '#14233a',
  },
} as const;

export type ColorScheme = keyof typeof palette;
export type ColorToken = keyof (typeof palette)['light'];

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 6, md: 8, lg: 10, pill: 999 } as const;
/** Type scale (px): labels 12–13, body 14, section 15–16, page titles 24, figures 28. */
export const fontSize = { xs: 12, sm: 13, md: 14, lg: 16, xl: 20, xxl: 24, display: 28 } as const;
export const layout = { sidebarExpanded: 244, sidebarCollapsed: 68, header: 56, contentPadding: 28 } as const;
/** WCAG 2.2 / platform guidance: interactive targets at least 44x44 points. */
export const minTouchTarget = 44;

/** Emits CSS custom properties for the web client: `--color-<token>` etc. */
export function toCssVariables(scheme: ColorScheme): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(palette[scheme])) vars[`--color-${kebab(k)}`] = v;
  for (const [k, v] of Object.entries(spacing)) vars[`--space-${k}`] = `${v}px`;
  for (const [k, v] of Object.entries(radius)) vars[`--radius-${k}`] = `${v}px`;
  return vars;
}

function kebab(s: string): string {
  return s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

/** WCAG relative-luminance contrast ratio between two #rrggbb colors. */
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
