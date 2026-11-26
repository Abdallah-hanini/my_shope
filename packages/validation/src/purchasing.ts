import { z } from 'zod';
import { moneySchema } from './settings';

// Suppliers, supplier bills matched to stock receipts, and supplier payments (T-76).

const version = z.number().int().min(1);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD');
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const createSupplierSchema = z.object({
  name: z.string().trim().min(1).max(200),
  nameAr: optionalText(200),
  phone: optionalText(40),
  email: z
    .string()
    .trim()
    .max(200)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null))
    .pipe(z.string().email('an email address').nullable()),
  taxNumber: optionalText(40),
  /** Days from the supplier's invoice date to the due date (0 = due on receipt). */
  paymentTermsDays: z.number().int().min(0).max(365),
});
export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;

export const updateSupplierSchema = createSupplierSchema.extend({ version, active: z.boolean() });
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;

/** A supplier's invoice for receipts already in stock; each line is what they charge before tax. */
export const createSupplierBillSchema = z.object({
  supplierId: z.string().uuid(),
  branchId: z.string().uuid(),
  supplierInvoiceNo: z.string().trim().min(1, "the supplier's invoice number").max(60),
  billDate: date,
  /** Tax charged on the bill (a code from the tax set-up); null = no tax. */
  taxCodeId: z.string().uuid().nullable(),
  lines: z
    .array(z.object({ movementId: z.string().uuid(), amount: moneySchema }))
    .min(1, 'choose at least one receipt')
    .max(200)
    .refine((l) => new Set(l.map((x) => x.movementId)).size === l.length, 'a receipt is listed twice'),
  /** Required when what is billed differs from the receipts' value. */
  varianceReason: optionalText(300),
  idempotencyKey: z.string().uuid(),
});
export type CreateSupplierBillInput = z.infer<typeof createSupplierBillSchema>;

export const SUPPLIER_PAYMENT_METHODS = ['cash', 'bank'] as const;
export const supplierPaymentSchema = z
  .object({
    method: z.enum(SUPPLIER_PAYMENT_METHODS),
    amount: moneySchema,
    reference: optionalText(80),
    idempotencyKey: z.string().uuid(),
  })
  .refine((v) => v.method === 'cash' || !!v.reference, {
    message: 'give the transfer reference',
    path: ['reference'],
  });
export type SupplierPaymentInput = z.infer<typeof supplierPaymentSchema>;

export const cancelSupplierBillSchema = z.object({ reason: z.string().trim().min(3).max(500) });
export type CancelSupplierBillInput = z.infer<typeof cancelSupplierBillSchema>;

export const supplierBillListQuerySchema = z.object({
  supplierId: z.string().uuid().optional(),
  status: z.enum(['open', 'all']).optional(),
});
export type SupplierBillListQuery = z.infer<typeof supplierBillListQuerySchema>;
