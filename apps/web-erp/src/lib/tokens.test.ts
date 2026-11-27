import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { palette } from '@erp/design-tokens';

// The CSS variables in globals.css mirror packages/design-tokens, where contrast is tested.
const css = readFileSync(join(__dirname, '../app/globals.css'), 'utf8');
const block = (selector: string) => {
  const i = css.indexOf(`${selector} {`);
  return css.slice(i, css.indexOf('}', i));
};
const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

describe('globals.css tokens', () => {
  it.each([
    [':root', 'light'],
    [":root[data-theme='dark']", 'dark'],
  ] as const)('%s matches the %s palette', (selector, scheme) => {
    const b = block(selector);
    for (const [k, v] of Object.entries(palette[scheme])) expect(b).toContain(`--color-${kebab(k)}: ${v};`);
  });
});
