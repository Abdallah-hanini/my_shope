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

// ── quotes (WMS-005, T-71) ───────────────────────────────────────────────────

/** Draft changes: discount and per-task price overrides (each with a reason). */
export const updateQuoteSchema = z
  .object({
    version: version.min(1),
    discountPct: percentSchema,
    discountReason: optionalText(300),
    lines: z
      .array(
        z.object({
          /** A labour line's task, or a parts line's job part. */
          taskId: z.string().uuid(),
          overrideAmount: z
            .string()
            .trim()
            .regex(/^\d{1,10}(\.\d{1,2})?$/, 'an amount, e.g. 150 or 150.50')
            .nullable(),
          overrideReason: optionalText(300),
        }),
      )
      .max(100),
  })
  .superRefine((v, ctx) => {
    if (Number(v.discountPct) > 0 && !v.discountReason)
      ctx.addIssue({ code: 'custom', path: ['discountReason'], message: 'give a reason for the discount' });
    v.lines.forEach((l, i) => {
      if (l.overrideAmount !== null && !l.overrideReason)
        ctx.addIssue({
          code: 'custom',
          path: ['lines', i, 'overrideReason'],
          message: 'give a reason for the price change',
        });
    });
  });
export type UpdateQuoteInput = z.infer<typeof updateQuoteSchema>;

export const quoteVersionSchema = z.object({ version: version.min(1) });
export type QuoteVersionInput = z.infer<typeof quoteVersionSchema>;

export const quoteDecisionSchema = z.discriminatedUnion('decision', [
  z.object({
    decision: z.literal('approve'),
    version: version.min(1),
    authorizedByName: z.string().trim().min(1).max(200),
    authorizedVia: z.enum(['in_person', 'phone', 'written']),
  }),
  z.object({
    decision: z.literal('decline'),
    version: version.min(1),
    reason: z.string().trim().min(3).max(500),
  }),
]);
export type QuoteDecisionInput = z.infer<typeof quoteDecisionSchema>;

// ── invoices and payments (step 3, T-72) ─────────────────────────────────────

/** The accountant's posting accounts for workshop invoices and payments. */
export const postingSettingsSchema = z.object({
  version,
  labourRevenueAccountId: z.string().uuid().nullable(),
  receivableAccountId: z.string().uuid().nullable(),
  cashAccountId: z.string().uuid().nullable(),
  cardAccountId: z.string().uuid().nullable(),
  bankAccountId: z.string().uuid().nullable(),
  /** Stock (T-74): inventory asset, goods received not yet invoiced, stock adjustments. */
  inventoryAccountId: z.string().uuid().nullable().optional(),
  goodsReceivedAccountId: z.string().uuid().nullable().optional(),
  stockAdjustmentAccountId: z.string().uuid().nullable().optional(),
  /** Parts on jobs (T-75): cost of parts sold, parts revenue. */
  cogsAccountId: z.string().uuid().nullable().optional(),
  partsRevenueAccountId: z.string().uuid().nullable().optional(),
  /** Supplier bills (T-76): payables, recoverable input tax, purchase price differences. */
  payablesAccountId: z.string().uuid().nullable().optional(),
  inputTaxAccountId: z.string().uuid().nullable().optional(),
  priceVarianceAccountId: z.string().uuid().nullable().optional(),
});
export type PostingSettingsInput = z.infer<typeof postingSettingsSchema>;

export const createInvoiceSchema = z.object({ quoteId: z.string().uuid() });
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;

export const PAYMENT_METHODS = ['cash', 'card', 'bank'] as const;
export const recordPaymentSchema = z
  .object({
    method: z.enum(PAYMENT_METHODS),
    amount: moneySchema,
    reference: optionalText(80),
    /** One per submitted form, so a double click records one payment. */
    idempotencyKey: z.string().uuid(),
  })
  .refine((v) => v.method === 'cash' || !!v.reference, {
    message: 'give the card slip or transfer reference',
    path: ['reference'],
  });
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;

export const creditNoteSchema = z.object({ reason: z.string().trim().min(3).max(500) });
export type CreditNoteInput = z.infer<typeof creditNoteSchema>;

/** The owner lets a car leave before its invoice is paid (recorded with the reason). */
export const releaseUnpaidSchema = z.object({
  version: version.min(1),
  reason: z.string().trim().min(3).max(500),
});
export type ReleaseUnpaidInput = z.infer<typeof releaseUnpaidSchema>;
