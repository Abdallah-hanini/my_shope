import { contrastRatio, minTouchTarget, palette, toCssVariables } from './index';

describe('design tokens', () => {
  it.each(['light', 'dark'] as const)('%s text and status colors meet WCAG AA (4.5:1)', (scheme) => {
    const p = palette[scheme];
    expect(contrastRatio(p.text, p.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(p.text, p.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(p.textMuted, p.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(p.onPrimary, p.primary)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(p.success, p.successBg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(p.danger, p.dangerBg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(p.warning, p.warningBg)).toBeGreaterThanOrEqual(4.5);
  });

  it('light and dark palettes define the same tokens', () => {
    expect(Object.keys(palette.dark).sort()).toEqual(Object.keys(palette.light).sort());
  });

  it('touch targets are at least 44pt', () => {
    expect(minTouchTarget).toBeGreaterThanOrEqual(44);
  });

  it('emits kebab-case CSS variables', () => {
    const vars = toCssVariables('light');
    expect(vars['--color-text-muted']).toBe(palette.light.textMuted);
    expect(vars['--space-md']).toBe('12px');
  });
});
