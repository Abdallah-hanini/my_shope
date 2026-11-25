/**
 * AUTO360 palette (docs/spec/AUTO360_UI_UX_MASTER_DESIGN.md). Semantic text colours are darker
 * (light) or lighter (dark) than the brand semantic colours so text meets WCAG AA on its
 * background; the brand colours are kept for icons, chart series and borders.
 */
export const palette = {
  light: {
    background: '#f8fafc',
    surface: '#ffffff',
    surfaceMuted: '#f1f5f9',
    text: '#101828',
    textMuted: '#475569',
    border: '#e2e8f0',
    primary: '#2563eb',
    onPrimary: '#ffffff',
    sidebar: '#101828',
    sidebarText: '#e2e8f0',
    sidebarMuted: '#94a3b8',
    sidebarActive: '#1e293b',
    success: '#047857',
    successBg: '#ecfdf5',
    successBrand: '#059669',
    danger: '#b91c1c',
    dangerBg: '#fef2f2',
    dangerBrand: '#dc2626',
    warning: '#92400e',
    warningBg: '#fffbeb',
    warningBrand: '#d97706',
  },
  dark: {
    background: '#0b1220',
    surface: '#111a2e',
    surfaceMuted: '#162036',
    text: '#e2e8f0',
    textMuted: '#94a3b8',
    border: '#1e293b',
    primary: '#60a5fa',
    onPrimary: '#0b1220',
    sidebar: '#070c17',
    sidebarText: '#e2e8f0',
    sidebarMuted: '#94a3b8',
    sidebarActive: '#16213a',
    success: '#34d399',
    successBg: '#052e26',
    successBrand: '#10b981',
    danger: '#fca5a5',
    dangerBg: '#2a0a0a',
    dangerBrand: '#ef4444',
    warning: '#fcd34d',
    warningBg: '#2a1e05',
    warningBrand: '#f59e0b',
  },
} as const;

export type ColorScheme = keyof typeof palette;
export type ColorToken = keyof (typeof palette)['light'];

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 4, md: 8, lg: 12, pill: 999 } as const;
/** Type scale (px): labels 12–14, body 14–16, headings 20/24/28. */
export const fontSize = { xs: 12, sm: 13, md: 15, lg: 18, xl: 20, xxl: 24, display: 28 } as const;
export const layout = { sidebarExpanded: 248, sidebarCollapsed: 72, header: 64, contentPadding: 24 } as const;
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
