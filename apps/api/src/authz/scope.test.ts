import { canDelegate, resolveScope } from './scope';

const C = 'c1';

describe('resolveScope', () => {
  it('returns null when nothing grants the permission', () => {
    expect(
      resolveScope(C, 'accounting.journal.post', [{ branchId: null, permissions: ['org.company.read'] }]),
    ).toBeNull();
  });

  it('is company-wide when any granting assignment has no branch', () => {
    const s = resolveScope(C, 'p', [
      { branchId: 'b1', permissions: ['p'] },
      { branchId: null, permissions: ['p'] },
    ]);
    expect(s).toEqual({ companyId: C, permission: 'p', allBranches: true, branchIds: [] });
  });

  it('unions branch-limited grants and ignores assignments without the permission', () => {
    const s = resolveScope(C, 'p', [
      { branchId: 'b2', permissions: ['p'] },
      { branchId: 'b1', permissions: ['p'] },
      { branchId: null, permissions: ['other'] },
      { branchId: 'b1', permissions: ['p'] },
    ]);
    expect(s).toEqual({ companyId: C, permission: 'p', allBranches: false, branchIds: ['b1', 'b2'] });
  });
});

describe('canDelegate (no privilege escalation)', () => {
  const admin = [{ branchId: null, permissions: ['a', 'b'] }];
  const branchAdmin = [{ branchId: 'b1', permissions: ['a', 'b'] }];

  it('allows granting a subset of held permissions', () => {
    expect(canDelegate(C, admin, ['a'], null)).toBe(true);
    expect(canDelegate(C, admin, ['a', 'b'], 'b1')).toBe(true);
  });

  it('refuses a permission the actor does not hold', () => {
    expect(canDelegate(C, admin, ['a', 'c'], null)).toBe(false);
  });

  it('refuses widening a branch-limited actor to all branches or another branch', () => {
    expect(canDelegate(C, branchAdmin, ['a'], null)).toBe(false);
    expect(canDelegate(C, branchAdmin, ['a'], 'b2')).toBe(false);
    expect(canDelegate(C, branchAdmin, ['a'], 'b1')).toBe(true);
  });

  it('refuses everything with no grants', () => {
    expect(canDelegate(C, [], ['a'], 'b1')).toBe(false);
  });
});
