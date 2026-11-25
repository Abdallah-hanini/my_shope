import type { CompanyScope } from '../auth/principal';

export interface AssignmentGrant {
  branchId: string | null;
  permissions: string[];
}

/**
 * Resolves the scope a set of role assignments grants for one permission. Returns null when no
 * assignment grants it.
 */
export function resolveScope(
  companyId: string,
  permission: string,
  grants: AssignmentGrant[],
): CompanyScope | null {
  const granting = grants.filter((g) => g.permissions.includes(permission));
  if (granting.length === 0) return null;
  const allBranches = granting.some((g) => g.branchId === null);
  const branchIds = allBranches ? [] : [...new Set(granting.map((g) => g.branchId as string))].sort();
  return { companyId, permission, allBranches, branchIds };
}

/**
 * Privilege-escalation rule: an actor may grant or revoke a role only if, for every permission in
 * that role, the actor already holds it over a scope that contains the target scope.
 */
export function canDelegate(
  companyId: string,
  actorGrants: AssignmentGrant[],
  rolePermissions: string[],
  targetBranchId: string | null,
): boolean {
  return rolePermissions.every((perm) => {
    const s = resolveScope(companyId, perm, actorGrants);
    if (!s) return false;
    if (s.allBranches) return true;
    return targetBranchId !== null && s.branchIds.includes(targetBranchId);
  });
}
