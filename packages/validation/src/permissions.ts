/**
 * Permission catalog. The server is the only enforcer; clients may read this list to hide actions
 * a user cannot perform, never to grant them.
 */
export const COMPANY_PERMISSIONS = [
  'org.company.read',
  'org.company.manage',
  'org.branch.read',
  'org.branch.manage',
  'iam.role.read',
  'iam.role.manage',
  'iam.assignment.read',
  'iam.assignment.manage',
  'iam.user.manage',
  'audit.read',
  'accounting.account.read',
  'accounting.account.manage',
  'accounting.period.read',
  'accounting.period.manage',
  'accounting.journal.read',
  'accounting.journal.post',
  'accounting.journal.reverse',
  'accounting.tax.manage',
  'reports.financial.read',
  'reports.targets.manage',
  'crm.customer.read',
  'crm.customer.manage',
  'workshop.job.read',
  'workshop.job.manage',
  'workshop.job.work',
  'workshop.job.qc',
  'workshop.pricing.manage',
  'billing.invoice.manage',
  'inventory.read',
  'inventory.manage',
  'inventory.adjust',
  'purchasing.read',
  'purchasing.manage',
  'purchasing.pay',
] as const;

export type CompanyPermission = (typeof COMPANY_PERMISSIONS)[number];

/** Groups for the permission matrix and role editor (display order). */
export const PERMISSION_GROUPS: { id: string; permissions: CompanyPermission[] }[] = [
  {
    id: 'organization',
    permissions: ['org.company.read', 'org.company.manage', 'org.branch.read', 'org.branch.manage'],
  },
  {
    id: 'accounting',
    permissions: [
      'accounting.account.read',
      'accounting.account.manage',
      'accounting.period.read',
      'accounting.period.manage',
      'accounting.journal.read',
      'accounting.journal.post',
      'accounting.journal.reverse',
      'accounting.tax.manage',
    ],
  },
  { id: 'reporting', permissions: ['reports.financial.read', 'reports.targets.manage'] },
  { id: 'customers', permissions: ['crm.customer.read', 'crm.customer.manage'] },
  { id: 'billing', permissions: ['billing.invoice.manage'] },
  { id: 'inventory', permissions: ['inventory.read', 'inventory.manage', 'inventory.adjust'] },
  { id: 'purchasing', permissions: ['purchasing.read', 'purchasing.manage', 'purchasing.pay'] },
  {
    id: 'workshop',
    permissions: [
      'workshop.job.read',
      'workshop.job.manage',
      'workshop.job.work',
      'workshop.job.qc',
      'workshop.pricing.manage',
    ],
  },
  {
    id: 'access',
    permissions: [
      'iam.role.read',
      'iam.role.manage',
      'iam.assignment.read',
      'iam.assignment.manage',
      'iam.user.manage',
    ],
  },
  { id: 'audit', permissions: ['audit.read'] },
];

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
