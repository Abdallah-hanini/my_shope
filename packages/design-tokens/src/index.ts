export const palette = {
  light: {
    background: '#f7f8fa',
    surface: '#ffffff',
    text: '#14171f',
    textMuted: '#4a5160',
    border: '#d5d9e0',
    primary: '#1d4ed8',
    onPrimary: '#ffffff',
    success: '#166534',
    successBg: '#dcfce7',
    danger: '#991b1b',
    dangerBg: '#fee2e2',
    warning: '#854d0e',
    warningBg: '#fef9c3',
  },
  dark: {
    background: '#0f1117',
    surface: '#171a22',
    text: '#eef0f4',
    textMuted: '#a9b0bd',
    border: '#2c313c',
    primary: '#7aa2ff',
    onPrimary: '#0b1020',
    success: '#86efac',
    successBg: '#12321f',
    danger: '#fca5a5',
    dangerBg: '#3a1515',
    warning: '#fde68a',
    warningBg: '#3a2f0b',
  },
} as const;

export type ColorScheme = keyof typeof palette;
export type ColorToken = keyof (typeof palette)['light'];

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 4, md: 8, lg: 12, pill: 999 } as const;
export const fontSize = { sm: 13, md: 15, lg: 18, xl: 22, xxl: 28 } as const;
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
