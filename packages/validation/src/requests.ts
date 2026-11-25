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
export const createAccountSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9.-]{1,32}$/, 'letters, digits, "." or "-" (max 32)'),
  name,
  nameAr: optionalArabicName,
  type: z.enum(accountTypes),
  parentId: uuid.nullable().optional(),
  isPosting: z.boolean(),
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
