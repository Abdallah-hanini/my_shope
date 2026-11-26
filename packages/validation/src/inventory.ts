import { z } from 'zod';

// Parts catalogue and stock (D-06: weighted average cost, T-74).

const version = z.number().int().min(1);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const PART_UNITS = ['each', 'litre', 'kg', 'metre', 'set'] as const;

/** Quantities with up to 3 decimals (e.g. 4.5 litres), more than 0. */
export const quantitySchema = z
  .string()
  .trim()
  .regex(/^\d{1,9}(\.\d{1,3})?$/, 'a quantity, e.g. 4 or 4.5')
  .refine((v) => Number(v) > 0, 'must be more than 0');
/** A unit cost with up to 4 decimals, 0 or more. */
export const unitCostSchema = z
  .string()
  .trim()
  .regex(/^\d{1,10}(\.\d{1,4})?$/, 'a cost, e.g. 12.5');

export const createPartSchema = z.object({
  sku: z
    .string()
    .trim()
    .toUpperCase()
    .pipe(z.string().regex(/^[A-Z0-9][A-Z0-9._/-]{0,39}$/, '1–40 letters, digits, ".", "_", "/" or "-"')),
  name: z.string().trim().min(1).max(200),
  nameAr: optionalText(200),
  brand: optionalText(80),
  unit: z.enum(PART_UNITS),
});
export type CreatePartInput = z.infer<typeof createPartSchema>;

export const updatePartSchema = createPartSchema
  .omit({ sku: true, unit: true })
  .extend({ version, active: z.boolean() });
export type UpdatePartInput = z.infer<typeof updatePartSchema>;

/** Goods received at a branch at a cost (supplier delivery or opening stock). */
export const receiveStockSchema = z.object({
  branchId: z.string().uuid(),
  /** The supplier who delivered (T-76); none for opening stock. Bills match receipts by supplier. */
  supplierId: z.string().uuid().nullable().optional(),
  quantity: quantitySchema,
  unitCost: unitCostSchema,
  reference: z.string().trim().min(1, 'give the supplier delivery note or invoice number').max(80),
  idempotencyKey: z.string().uuid(),
});
export type ReceiveStockInput = z.infer<typeof receiveStockSchema>;

/** A counted difference: out at the average cost; in at a given cost. Always with a reason. */
export const adjustStockSchema = z
  .object({
    branchId: z.string().uuid(),
    direction: z.enum(['in', 'out']),
    quantity: quantitySchema,
    unitCost: unitCostSchema.optional().nullable(),
    reason: z.string().trim().min(3).max(300),
    idempotencyKey: z.string().uuid(),
  })
  .refine((v) => v.direction === 'out' || !!v.unitCost, {
    message: 'give the cost of the units found',
    path: ['unitCost'],
  });
export type AdjustStockInput = z.infer<typeof adjustStockSchema>;

export const partListQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  branchId: z.string().uuid().optional(),
  includeInactive: z.enum(['true', 'false']).optional(),
});
export type PartListQuery = z.infer<typeof partListQuerySchema>;

// ── parts on jobs (T-75) ─────────────────────────────────────────────────────

/** Selling price per unit, before or including tax per the tax set-up's price basis (owner). */
export const partPriceSchema = z.object({
  version,
  salePrice: z
    .string()
    .trim()
    .regex(/^\d{1,10}(\.\d{1,2})?$/, 'a price, e.g. 45 or 45.50')
    .refine((v) => Number(v) > 0, 'must be more than 0')
    .nullable(),
});
export type PartPriceInput = z.infer<typeof partPriceSchema>;

/** Reserve a part from the job's branch stock for the job. */
export const addJobPartSchema = z.object({ partId: z.string().uuid(), quantity: quantitySchema });
export type AddJobPartInput = z.infer<typeof addJobPartSchema>;

export const JOB_PART_STATUSES = [
  'ordered',
  'reserved',
  'issued',
  'returned',
  'released',
  'cancelled',
] as const;
export const jobPartStepSchema = z.object({ idempotencyKey: z.string().uuid() });
export type JobPartStepInput = z.infer<typeof jobPartStepSchema>;

// ── special orders (T-77) ───────────────────────────────────────────────────

/** Order a part for a job when the branch has too little (after the customer authorised). */
export const orderJobPartSchema = z.object({
  partId: z.string().uuid(),
  quantity: quantitySchema,
  supplierId: z.string().uuid().nullable().optional(),
  /** The supplier's order or confirmation reference, if any. */
  orderRef: optionalText(80),
});
export type OrderJobPartInput = z.infer<typeof orderJobPartSchema>;

export const cancelOrderSchema = z.object({ reason: z.string().trim().min(3).max(300) });
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;

export const specialOrderListQuerySchema = z.object({
  status: z.enum(['open', 'all']).optional(),
  branchId: z.string().uuid().optional(),
});
export type SpecialOrderListQuery = z.infer<typeof specialOrderListQuerySchema>;

// ── stock transfers between branches (T-78) ─────────────────────────────────

export const createTransferSchema = z
  .object({
    fromBranchId: z.string().uuid(),
    toBranchId: z.string().uuid(),
    lines: z
      .array(z.object({ partId: z.string().uuid(), quantity: quantitySchema }))
      .min(1, 'add at least one part')
      .max(50)
      .refine((l) => new Set(l.map((x) => x.partId)).size === l.length, 'a part is listed twice'),
    note: optionalText(300),
    idempotencyKey: z.string().uuid(),
  })
  .refine((v) => v.fromBranchId !== v.toBranchId, {
    message: 'choose another branch to send to',
    path: ['toBranchId'],
  });
export type CreateTransferInput = z.infer<typeof createTransferSchema>;

export const cancelTransferSchema = z.object({ reason: z.string().trim().min(3).max(300) });
export type CancelTransferInput = z.infer<typeof cancelTransferSchema>;

export const transferListQuerySchema = z.object({ status: z.enum(['open', 'all']).optional() });
export type TransferListQuery = z.infer<typeof transferListQuerySchema>;
