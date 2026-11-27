import { z } from 'zod';
import { moneySchema } from './settings';

/**
 * R3a: reorder points, sales targets and alerts (docs/REPORTING_PLAN.md, docs/KPI_DICTIONARY.md).
 */

/** A quantity of 0 or more with up to 3 decimals. */
const minQuantity = z
  .string()
  .trim()
  .regex(/^\d{1,9}(\.\d{1,3})?$/, 'a quantity, e.g. 0, 4 or 4.5');

/**
 * Reorder point of a part at a branch. Low when available (on hand − reserved) is at or below
 * `minQuantity`. `version` is required to change an existing level (omit it to create one).
 */
export const reorderLevelSchema = z.object({
  minQuantity,
  reorderQuantity: z
    .string()
    .trim()
    .regex(/^\d{1,9}(\.\d{1,3})?$/, 'a quantity, e.g. 4 or 4.5')
    .refine((v) => Number(v) > 0, 'must be more than 0'),
  version: z.number().int().min(1).optional(),
});
export type ReorderLevelInput = z.infer<typeof reorderLevelSchema>;

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'a month, e.g. 2026-11');

/** Monthly sales target (sales excluding tax), for a branch or (no branch) the whole company. */
export const salesTargetSchema = z.object({
  month,
  branchId: z.string().uuid().nullable().default(null),
  amount: moneySchema,
  version: z.number().int().min(1).optional(),
});
export type SalesTargetInput = z.infer<typeof salesTargetSchema>;

export const targetsQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  branchId: z.string().uuid().optional(),
});
export type TargetsQuery = z.infer<typeof targetsQuerySchema>;

export const lowStockQuerySchema = z.object({ branchId: z.string().uuid().optional() });
export type LowStockQuery = z.infer<typeof lowStockQuerySchema>;

/** Receivables older than this many days past the invoice date raise an alert. */
export const OVERDUE_ALERT_DAYS = 60;
