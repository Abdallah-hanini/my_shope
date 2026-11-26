import { z } from 'zod';

// Customers, vehicles and workshop job cards (WMS-001, WMS-006, WMS-010, WMS-011).

const uuid = z.string().uuid();
const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));
const version = z.number().int().min(1);

/** Plate as typed on documents: upper case, single spaces; letters (incl. Arabic), digits, "-". */
export const plateSchema = z
  .string()
  .transform((v) => v.trim().replace(/\s+/g, ' ').toUpperCase())
  .pipe(z.string().regex(/^[\p{L}\p{N}][\p{L}\p{N} -]{0,19}$/u, '1–20 letters, digits, spaces or "-"'));

/**
 * VIN: 17 characters, digits and letters except I, O and Q (ISO 3779). The check digit is not
 * enforced because it is only mandatory in North America.
 */
export const vinSchema = z
  .string()
  .transform((v) => v.trim().toUpperCase())
  .pipe(z.string().regex(/^[A-HJ-NPR-Z0-9]{17}$/, '17 letters and digits (no I, O or Q)'));

export const createCustomerSchema = z.object({
  kind: z.enum(['individual', 'company']).default('individual'),
  name: text(200),
  nameAr: optionalText(200),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9][0-9 -]{5,19}$/, 'digits, spaces or "-", optionally starting with +'),
  email: z
    .string()
    .trim()
    .email()
    .max(320)
    .optional()
    .nullable()
    .or(z.literal('').transform(() => null)),
  notes: optionalText(1000),
});
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export const updateCustomerSchema = createCustomerSchema.extend({ version });
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

const currentYear = new Date().getUTCFullYear();
export const createVehicleSchema = z.object({
  customerId: uuid,
  plate: plateSchema,
  vin: vinSchema
    .optional()
    .nullable()
    .or(z.literal('').transform(() => null)),
  make: text(60),
  model: text(60),
  year: z.coerce
    .number()
    .int()
    .min(1950)
    .max(currentYear + 1)
    .optional()
    .nullable(),
  color: optionalText(40),
});
export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;
export const updateVehicleSchema = createVehicleSchema.extend({ version });
export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>;

export const JOB_STATUSES = [
  'draft',
  'approved',
  'assigned',
  'in_progress',
  'rework',
  'qc',
  'ready',
  'delivered',
  'cancelled',
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];
/** Statuses on the repair board (before delivery or cancellation), in workflow order. */
export const OPEN_JOB_STATUSES = [
  'draft',
  'approved',
  'assigned',
  'in_progress',
  'rework',
  'qc',
  'ready',
] as const;
export const FUEL_LEVELS = ['empty', 'quarter', 'half', 'three_quarters', 'full'] as const;
export const AUTHORIZATION_METHODS = ['in_person', 'phone', 'written'] as const;

const taskInput = z.object({
  description: text(500),
  estimatedHours: z
    .string()
    .trim()
    .regex(/^\d{1,3}(\.\d{1,2})?$/, 'hours, e.g. 1.5')
    .refine((v) => Number(v) > 0, 'must be more than 0'),
});
export type JobTaskInput = z.infer<typeof taskInput>;

/** Opening a job card is the vehicle check-in (WEB-014). */
export const createJobSchema = z.object({
  branchId: uuid,
  vehicleId: uuid,
  complaint: text(2000),
  odometerIn: z.coerce.number().int().min(0).max(9_999_999),
  fuelLevel: z.enum(FUEL_LEVELS),
  promisedAt: z.string().datetime({ offset: true }).optional().nullable(),
  tasks: z.array(taskInput).min(1, 'add at least one task').max(50),
});
export type CreateJobInput = z.infer<typeof createJobSchema>;

/** Details editable while the job is a draft (tasks freeze when the customer authorises them). */
export const updateJobDraftSchema = createJobSchema
  .omit({ branchId: true, vehicleId: true })
  .extend({ version });
export type UpdateJobDraftInput = z.infer<typeof updateJobDraftSchema>;

export const authorizeJobSchema = z.object({
  version,
  authorizedByName: text(200),
  authorizedVia: z.enum(AUTHORIZATION_METHODS),
});
export type AuthorizeJobInput = z.infer<typeof authorizeJobSchema>;

export const assignTaskSchema = z.object({ version, technicianId: uuid.nullable() });
export type AssignTaskInput = z.infer<typeof assignTaskSchema>;

export const jobVersionSchema = z.object({ version });
export type JobVersionInput = z.infer<typeof jobVersionSchema>;

export const promiseJobSchema = z.object({
  version,
  promisedAt: z.string().datetime({ offset: true }).nullable(),
});
export type PromiseJobInput = z.infer<typeof promiseJobSchema>;

export const qcResultSchema = z.discriminatedUnion('result', [
  z.object({ result: z.literal('pass'), version, note: optionalText(2000) }),
  z.object({
    result: z.literal('fail'),
    version,
    note: text(2000),
    /** Tasks to redo; at least one. */
    reopenTaskIds: z.array(uuid).min(1, 'choose the tasks to redo').max(50),
  }),
]);
export type QcResultInput = z.infer<typeof qcResultSchema>;

export const deliverJobSchema = z.object({
  version,
  deliveredToName: text(200),
  odometerOut: z.coerce.number().int().min(0).max(9_999_999),
});
export type DeliverJobInput = z.infer<typeof deliverJobSchema>;

export const cancelJobSchema = z.object({ version, reason: text(500).pipe(z.string().min(3)) });
export type CancelJobInput = z.infer<typeof cancelJobSchema>;

export const jobNoteSchema = z.object({ note: text(2000) });
export type JobNoteInput = z.infer<typeof jobNoteSchema>;

export const jobListQuerySchema = z.object({
  status: z.enum(JOB_STATUSES).optional(),
  branchId: uuid.optional(),
  /** "open" = every status before delivered/cancelled (the board). */
  view: z.enum(['open', 'all']).default('open'),
  limit: z.coerce.number().int().min(1).max(200).default(200),
});
export type JobListQuery = z.infer<typeof jobListQuerySchema>;
