import { companyNavigation, sectionFor } from './navigation';

describe('sectionFor', () => {
  const base = '/en/c/c1';
  const groups = companyNavigation('en', 'c1', () => true);

  it('picks the longest matching menu item', () => {
    expect(sectionFor(groups, `${base}/journals/j1`, base)?.label).toBe('Journals');
    expect(sectionFor(groups, `${base}/users/u1`, base)?.label).toBe('Users');
  });

  it('never lends the company home to pages outside the menu', () => {
    expect(sectionFor(groups, `${base}/search`, base)).toBeUndefined();
    expect(sectionFor(groups, base, base)?.label).toBe('Executive dashboard');
  });
});
