import { z } from 'zod';
import { isSupportedCurrency, moneyString } from './money';

// Request schemas shared by the API (authoritative validation) and clients (early feedback).
// The server never trusts client-side validation.

const code = (max: number) =>
  z
    .string()
    .trim()
    .regex(new RegExp(`^[A-Za-z0-9_-]{1,${max}}$`), `letters, digits, "_" or "-" (max ${max})`);
const name = z.string().trim().min(1).max(200);
const optionalArabicName = z.string().trim().min(1).max(200).optional();
const uuid = z.string().uuid();
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
  }, 'must be a real calendar date');

export const createUserSchema = z.object({
  oidcIssuer: z.string().url().max(500),
  oidcSubject: z.string().min(1).max(255),
  email: z.string().email().max(320),
  displayName: name,
  locale: z.enum(['en', 'ar']).default('en'),
  isPlatformAdmin: z.boolean().default(false),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const createCompanySchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{2,32}$/, '2–32 letters, digits, "_" or "-"'),
  legalName: name,
  legalNameAr: optionalArabicName,
  baseCurrency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .refine(isSupportedCurrency, 'unsupported currency'),
  timezone: z.string().refine((tz) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, 'must be an IANA time zone, e.g. Asia/Qatar'),
  /** Receives the company-administrator role on every branch. */
  initialAdminUserId: uuid,
});
export type CreateCompanyInput = z.infer<typeof createCompanySchema>;

export const createBranchSchema = z.object({ code: code(32), name, nameAr: optionalArabicName });
export type CreateBranchInput = z.infer<typeof createBranchSchema>;

export const createRoleSchema = z.object({
  code: code(64),
  name,
  nameAr: optionalArabicName,
  permissions: z.array(z.string().min(1)).min(1).max(200),
});
export type CreateRoleInput = z.infer<typeof createRoleSchema>;

export const createRoleAssignmentSchema = z.object({
  userId: uuid,
  roleId: uuid,
  /** Omit (or null) for every branch of the company. */
  branchId: uuid.nullable().optional(),
});
export type CreateRoleAssignmentInput = z.infer<typeof createRoleAssignmentSchema>;

export const accountTypes = ['asset', 'liability', 'equity', 'revenue', 'expense'] as const;

/**
 * Optional reporting classification of a posting account. Reports never guess from names:
 * cash position uses cash/bank accounts, gross profit uses cogs accounts (docs/KPI_DICTIONARY.md).
 */
export const accountReportingClasses = [
  'cash',
  'bank',
  'receivable',
  'payable',
  'inventory',
  'cogs',
] as const;
export type AccountReportingClass = (typeof accountReportingClasses)[number];
/** Which account type each class belongs to (also enforced by a database check). */
export const reportingClassAccountType: Record<AccountReportingClass, (typeof accountTypes)[number]> = {
  cash: 'asset',
  bank: 'asset',
  receivable: 'asset',
  inventory: 'asset',
  payable: 'liability',
  cogs: 'expense',
};
export const createAccountSchema = z
  .object({
    code: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9.-]{1,32}$/, 'letters, digits, "." or "-" (max 32)'),
    name,
    nameAr: optionalArabicName,
    type: z.enum(accountTypes),
    parentId: uuid.nullable().optional(),
    isPosting: z.boolean(),
    reportingClass: z.enum(accountReportingClasses).nullable().optional(),
  })
  .refine((v) => !v.reportingClass || v.isPosting, {
    message: 'only posting accounts can have a reporting class',
    path: ['reportingClass'],
  })
  .refine((v) => !v.reportingClass || reportingClassAccountType[v.reportingClass] === v.type, {
    message: 'reporting class does not match the account type',
    path: ['reportingClass'],
  });
export type CreateAccountInput = z.infer<typeof createAccountSchema>;

export const createFiscalPeriodSchema = z
  .object({ name: z.string().trim().min(1).max(64), startDate: isoDate, endDate: isoDate })
  .refine((v) => v.endDate >= v.startDate, {
    message: 'endDate must be on or after startDate',
    path: ['endDate'],
  });
export type CreateFiscalPeriodInput = z.infer<typeof createFiscalPeriodSchema>;

export const closeFiscalPeriodSchema = z.object({
  /** Optimistic lock: the version the user saw. */
  version: z.number().int().min(1),
  reason: z.string().trim().min(3).max(500),
});
export type CloseFiscalPeriodInput = z.infer<typeof closeFiscalPeriodSchema>;

export const journalLineSchema = z.object({
  accountId: uuid,
  debit: moneyString.default('0'),
  credit: moneyString.default('0'),
  description: z.string().trim().max(500).optional(),
});

export const postJournalSchema = z.object({
  postingDate: isoDate,
  description: z.string().trim().min(1).max(500),
  branchId: uuid.nullable().optional(),
  lines: z.array(journalLineSchema).min(2).max(500),
});
export type PostJournalInput = z.infer<typeof postJournalSchema>;

export const reverseJournalSchema = z.object({
  postingDate: isoDate,
  reason: z.string().trim().min(3).max(500),
});
export type ReverseJournalInput = z.infer<typeof reverseJournalSchema>;

export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_.:-]{8,128}$/;

export const listQuerySchema = z.object({
  cursor: z.string().max(512).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

const yearMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'must be YYYY-MM');
export const MAX_REPORT_MONTHS = 24;
export const financialSummaryQuerySchema = z
  .object({ from: yearMonth, to: yearMonth, branchId: uuid.optional() })
  .refine((v) => v.from <= v.to, { message: 'from must not be after to', path: ['to'] })
  .refine((v) => monthsBetween(v.from, v.to) <= MAX_REPORT_MONTHS, {
    message: `at most ${MAX_REPORT_MONTHS} months`,
    path: ['to'],
  });
export type FinancialSummaryQuery = z.infer<typeof financialSummaryQuerySchema>;

/** Longest date range for the trial balance and general ledger (keeps queries bounded). */
export const MAX_LEDGER_RANGE_DAYS = 3 * 366;
const ledgerRange = z.object({ from: isoDate, to: isoDate, branchId: uuid.optional() });
type Range = { from: string; to: string };
const rangeOrdered: [(v: Range) => boolean, { message: string; path: string[] }] = [
  (v) => v.from <= v.to,
  { message: 'from must not be after to', path: ['to'] },
];
const rangeBounded: [(v: Range) => boolean, { message: string; path: string[] }] = [
  (v) => (Date.parse(v.to) - Date.parse(v.from)) / 86_400_000 < MAX_LEDGER_RANGE_DAYS,
  { message: 'at most 3 years', path: ['to'] },
];
const queryBool = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => v === 'true');

/** WEB-122. Opening balances are all history before `from`. */
export const trialBalanceQuerySchema = ledgerRange
  .extend({ includeZero: queryBool })
  .refine(...rangeOrdered)
  .refine(...rangeBounded);
export type TrialBalanceQuery = z.infer<typeof trialBalanceQuerySchema>;

/** WEB-100. One posting account; keyset pagination by `cursor` (opaque). */
export const generalLedgerQuerySchema = ledgerRange
  .extend({
    accountId: uuid,
    cursor: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,200}$/, 'invalid cursor')
      .optional(),
    limit: z.coerce.number().int().min(1).max(500).default(200),
  })
  .refine(...rangeOrdered)
  .refine(...rangeBounded);
export type GeneralLedgerQuery = z.infer<typeof generalLedgerQuerySchema>;

/** WEB-237 global search. Whitespace is collapsed; at least 2 characters after trimming. */
export const searchQuerySchema = z.object({
  q: z
    .string()
    .transform((v) => v.trim().replace(/\s+/g, ' '))
    .pipe(z.string().min(2, 'type at least 2 characters').max(100)),
  limit: z.coerce.number().int().min(1).max(20).default(5),
});
export type SearchQuery = z.infer<typeof searchQuerySchema>;

/** Inclusive number of calendar months between two YYYY-MM values. */
export function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number) as [number, number];
  const [ty, tm] = to.split('-').map(Number) as [number, number];
  return (ty - fy) * 12 + (tm - fm) + 1;
}

/** Keycloak-compatible username: lower-case letters, digits, dot, dash, underscore. */
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9._-]{2,49}$/, '3–50 characters: letters, digits, ".", "-" or "_"');

export const createStaffSchema = z.object({
  username: usernameSchema,
  email: z.string().trim().email().max(320),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  locale: z.enum(['en', 'ar']).default('en'),
  roleId: uuid,
  /** Omit (or null) for every branch of the company. */
  branchId: uuid.nullable().optional(),
  /** Require an authenticator app (TOTP) at first sign-in. */
  requireOtp: z.boolean().default(true),
});
export type CreateStaffInput = z.infer<typeof createStaffSchema>;

export const updateRoleSchema = z.object({
  name: z.string().trim().min(1).max(200),
  nameAr: z.string().trim().min(1).max(200).nullable().optional(),
  permissions: z.array(z.string().min(1)).min(1).max(200),
  /** Optimistic lock: the version the editor loaded. */
  version: z.number().int().min(1),
});
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;

export const setUserStatusSchema = z.object({
  status: z.enum(['active', 'inactive']),
  reason: z.string().trim().min(3).max(500),
});
export type SetUserStatusInput = z.infer<typeof setUserStatusSchema>;
