import type { Request } from 'express';

export interface Principal {
  userId: string;
  email: string;
  isPlatformAdmin: boolean;
}

/** Effective scope for the permission a route requires, resolved on the server per request. */
export interface CompanyScope {
  companyId: string;
  permission: string;
  /** true when at least one granting assignment covers every branch. */
  allBranches: boolean;
  /** Branches granted individually (ignored when allBranches). */
  branchIds: string[];
}

export interface AuthedRequest extends Request {
  principal?: Principal;
  scope?: CompanyScope;
}

export function scopeIncludesBranch(scope: CompanyScope, branchId: string | null | undefined): boolean {
  if (scope.allBranches) return true;
  return !!branchId && scope.branchIds.includes(branchId);
}
