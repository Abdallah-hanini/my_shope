import { renderToStaticMarkup } from 'react-dom/server';
import { StatusBadge } from './StatusBadge';

describe('StatusBadge', () => {
  it('renders a visible text label and hides the decorative glyph from assistive tech', () => {
    const html = renderToStaticMarkup(<StatusBadge tone="down" label="Unavailable" />);
    expect(html).toContain('Unavailable');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('data-tone="down"');
  });
});
