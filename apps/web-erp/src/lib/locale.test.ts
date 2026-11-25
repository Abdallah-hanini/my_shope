import { negotiateLocale } from './locale';

describe('negotiateLocale', () => {
  it.each([
    [undefined, 'en'],
    ['', 'en'],
    ['ar-QA,ar;q=0.9,en;q=0.8', 'ar'],
    ['en-US,en;q=0.9,ar;q=0.8', 'en'],
    ['fr-FR,ar;q=0.5', 'ar'],
    ['fr-FR,de;q=0.5', 'en'],
    ['en;q=0.2,ar;q=0.9', 'ar'],
    ['ar;q=0', 'en'],
  ])('%p -> %p', (header, expected) => {
    expect(negotiateLocale(header)).toBe(expected);
  });
});
