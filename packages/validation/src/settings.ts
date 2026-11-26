import { z } from 'zod';

// Tax set-up (D-05: configured by the accountant per country), labour rates and discount limit,
// and the company letterhead.

const version = z.number().int().min(0);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD');
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

/** A percentage with up to 4 decimals, 0–100 (e.g. "5", "15.0000"). */
export const percentSchema = z
  .string()
  .trim()
  .regex(/^\d{1,3}(\.\d{1,4})?$/, 'a percentage, e.g. 5 or 15.5')
  .refine((v) => Number(v) <= 100, 'at most 100');

/** A money amount with up to 2 decimals, more than 0. */
export const moneySchema = z
  .string()
  .trim()
  .regex(/^\d{1,10}(\.\d{1,2})?$/, 'an amount, e.g. 150 or 150.50')
  .refine((v) => Number(v) > 0, 'must be more than 0');

export const createTaxCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .pipe(z.string().regex(/^[A-Z0-9][A-Z0-9_-]{0,14}$/, '1–15 letters, digits, "-" or "_"')),
  name: z.string().trim().min(1).max(100),
  nameAr: optionalText(100),
  /** Liability posting account the tax is owed to (used by invoices). */
  outputAccountId: z.string().uuid().optional().nullable(),
});
export type CreateTaxCodeInput = z.infer<typeof createTaxCodeSchema>;

export const updateTaxCodeSchema = createTaxCodeSchema
  .omit({ code: true })
  .extend({ version: version.min(1), active: z.boolean() });
export type UpdateTaxCodeInput = z.infer<typeof updateTaxCodeSchema>;

/** A rate applies from a date onwards until a later one; past rates are never changed. */
export const addTaxRateSchema = z.object({ rate: percentSchema, effectiveFrom: date });
export type AddTaxRateInput = z.infer<typeof addTaxRateSchema>;

export const taxSettingsSchema = z.object({
  version,
  /** Whether prices typed in (labour rates, parts) already include the tax. */
  pricesIncludeTax: z.boolean(),
  /** The tax code applied to sales unless chosen otherwise; null = no tax. */
  defaultTaxCodeId: z.string().uuid().nullable(),
  taxRegistrationNo: optionalText(40),
});
export type TaxSettingsInput = z.infer<typeof taxSettingsSchema>;

export const addLabourRateSchema = z.object({ rate: moneySchema, effectiveFrom: date });
export type AddLabourRateInput = z.infer<typeof addLabourRateSchema>;

export const pricingSettingsSchema = z.object({
  version,
  /** Largest discount (% of a quote) a manager may give; above it needs the owner's approval. */
  managerDiscountLimitPct: percentSchema,
});
export type PricingSettingsInput = z.infer<typeof pricingSettingsSchema>;

export const companyProfileSchema = z.object({
  version: version.min(1),
  crNumber: optionalText(40),
  address: optionalText(300),
  addressAr: optionalText(300),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9][0-9 -]{5,19}$/, 'digits, spaces or "-", optionally starting with +')
    .optional()
    .nullable()
    .or(z.literal('').transform(() => null)),
});
export type CompanyProfileInput = z.infer<typeof companyProfileSchema>;

/** Logo upload limit (re-encoded by the server to PNG, at most 600 × 300). */
export const LOGO_LIMITS = { maxBytes: 2 * 1024 * 1024, maxWidth: 600, maxHeight: 300 } as const;
