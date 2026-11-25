/**
 * Permission catalog. The server is the only enforcer; clients may read this list to hide actions
 * a user cannot perform, never to grant them.
 */
export const COMPANY_PERMISSIONS = [
  'org.company.read',
  'org.branch.read',
  'org.branch.manage',
  'iam.role.read',
  'iam.role.manage',
  'iam.assignment.read',
  'iam.assignment.manage',
  'audit.read',
  'accounting.account.read',
  'accounting.account.manage',
  'accounting.period.read',
  'accounting.period.manage',
  'accounting.journal.read',
  'accounting.journal.post',
  'accounting.journal.reverse',
  'reports.financial.read',
] as const;

export type CompanyPermission = (typeof COMPANY_PERMISSIONS)[number];

export function isCompanyPermission(value: string): value is CompanyPermission {
  return (COMPANY_PERMISSIONS as readonly string[]).includes(value);
}

/** Role created with every new company and given to its initial administrator. */
export const COMPANY_ADMIN_ROLE = {
  code: 'company-admin',
  name: 'Company administrator',
  nameAr: 'مسؤول الشركة',
  permissions: [...COMPANY_PERMISSIONS],
} as const;
