import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  AssignTaskInput,
  AuthorizeJobInput,
  CancelJobInput,
  CreateJobInput,
  DeliverJobInput,
  JobListQuery,
  JobNoteInput,
  JobStatus,
  JobVersionInput,
  PromiseJobInput,
  QcResultInput,
  PhotoMetaInput,
  RecordInspectionInput,
  UpdateJobDraftInput,
} from '@erp/validation';
import { INSPECTION_ITEMS, PHOTO_LIMITS } from '@erp/validation';
import type { CompanyScope, Principal } from '../auth/principal';
import { AuthzService } from '../authz/authz.service';
import { resolveScope, type AssignmentGrant } from '../authz/scope';
import { conflict, forbidden, notFound, unprocessable } from '../common/errors';
import { PrismaService } from '../infra/prisma.service';
import { writeAudit, type AuditContext } from '../platform/audit';
import { enqueueOutbox } from '../platform/outbox';
import { formatDocumentNumber, nextDocumentNumber } from '../platform/sequence';
import type { JobCardDto, JobListItemDto, TechnicianDto } from './job.dto';
import { spanSeconds, toHours, toMinutes } from './labour';
import { processPhoto, type ProcessedPhoto } from './photo-processing';
import {
  allowedInStatus,
  availableActions,
  OPEN_STATUSES,
  permits,
  statusAfterAssignment,
  type Actor,
  TIME_ENTRY_STATUSES,
  type JobAction,
} from './lifecycle';

type Tx = Prisma.TransactionClient;

/** Clocks off every open time entry matching `where` (task done, reassigned or job cancelled). */
export function closeOpenEntries(tx: Tx, where: { taskId?: string; jobId?: string }, by: string) {
  return tx.taskTimeEntry.updateMany({
    where: { ...where, endedAt: null },
    data: { endedAt: new Date(), endedBy: by },
  });
}
const jobInclude = {
  branch: { select: { code: true } },
  customer: { select: { id: true, name: true, nameAr: true, phone: true } },
  vehicle: { select: { id: true, plate: true, make: true, model: true, year: true } },
  tasks: { orderBy: { lineNo: 'asc' } },
} satisfies Prisma.JobCardInclude;
type JobRow = Prisma.JobCardGetPayload<{ include: typeof jobInclude }>;

const covers = (grants: AssignmentGrant[], companyId: string, permission: string, branchId: string) => {
  const s = resolveScope(companyId, permission, grants);
  return !!s && (s.allBranches || s.branchIds.includes(branchId));
};
const isOverdue = (status: string, promisedAt: Date | null) =>
  !!promisedAt &&
  promisedAt < new Date() &&
  (OPEN_STATUSES as readonly string[]).includes(status) &&
  status !== 'ready';

/**
 * Workshop job cards (WMS-006/010/011). Every change: status and permission checked against the
 * lifecycle, optimistic version, and in one transaction the timeline event, audit and outbox.
 */
@Injectable()
export class JobService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthzService,
  ) {}

  private branchWhere(scope: CompanyScope): Prisma.JobCardWhereInput {
    return scope.allBranches ? {} : { branchId: { in: scope.branchIds } };
  }

  async list(scope: CompanyScope, q: JobListQuery, vehicleId?: string): Promise<JobListItemDto[]> {
    if (q.branchId && !scope.allBranches && !scope.branchIds.includes(q.branchId)) {
      throw forbidden('Branch is outside your scope');
    }
    const rows = await this.prisma.jobCard.findMany({
      where: {
        companyId: scope.companyId,
        ...this.branchWhere(scope),
        ...(q.branchId ? { branchId: q.branchId } : {}),
        ...(vehicleId ? { vehicleId } : {}),
        ...(q.status
          ? { status: q.status }
          : q.view === 'open'
            ? { status: { in: [...OPEN_STATUSES] } }
            : {}),
      },
      include: jobInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit,
    });
    const names = await this.userNames(rows.flatMap((r) => r.tasks.map((t) => t.technicianId)));
    return rows.map((r) => ({
      id: r.id,
      number: r.number,
      status: r.status,
      branchId: r.branchId,
      branchCode: r.branch.code,
      plate: r.vehicle.plate,
      vehicleName: `${r.vehicle.make} ${r.vehicle.model}`,
      customerName: r.customer.name,
      promisedAt: r.promisedAt?.toISOString() ?? null,
      overdue: isOverdue(r.status, r.promisedAt),
      technicianNames: [
        ...new Set(r.tasks.flatMap((t) => (t.technicianId ? [names.get(t.technicianId) ?? '—'] : []))),
      ],
      tasksDone: r.tasks.filter((t) => t.status === 'done').length,
      tasksTotal: r.tasks.length,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /** Every job of one vehicle the caller may see, newest first (service history). */
  forVehicle(scope: CompanyScope, vehicleId: string): Promise<JobListItemDto[]> {
    return this.list(scope, { view: 'all', limit: 500 }, vehicleId);
  }

  async get(scope: CompanyScope, p: Principal, id: string): Promise<JobCardDto> {
    const job = await this.load(this.prisma, scope, id);
    return this.toDto(job, await this.actorFor(p, job), p.userId);
  }

  async technicians(scope: CompanyScope, p: Principal, id: string): Promise<TechnicianDto[]> {
    const job = await this.load(this.prisma, scope, id);
    if (!(await this.actorFor(p, job)).manage) throw forbidden('Only workshop managers assign technicians');
    return this.eligibleTechnicians(this.prisma, job.companyId, job.branchId);
  }

  async create(
    scope: CompanyScope,
    p: Principal,
    input: CreateJobInput,
    ctx: AuditContext,
  ): Promise<JobCardDto> {
    const grants = await this.authz.grants(p.userId, scope.companyId);
    if (!covers(grants, scope.companyId, 'workshop.job.manage', input.branchId)) {
      throw forbidden('You cannot open job cards for this branch');
    }
    const [branch, vehicle, company] = await Promise.all([
      this.prisma.branch.findUnique({
        where: { companyId_id: { companyId: scope.companyId, id: input.branchId } },
      }),
      this.prisma.vehicle.findUnique({
        where: { companyId_id: { companyId: scope.companyId, id: input.vehicleId } },
      }),
      this.prisma.company.findUniqueOrThrow({ where: { id: scope.companyId } }),
    ]);
    if (!branch || branch.status !== 'active')
      throw unprocessable('branchId is not an active branch of this company');
    if (!vehicle || vehicle.status !== 'active')
      throw unprocessable('vehicleId is not an active vehicle of this company');
    const year = new Intl.DateTimeFormat('en-CA', { timeZone: company.timezone, year: 'numeric' }).format(
      new Date(),
    );
    const id = await this.prisma.$transaction(async (tx) => {
      const n = await nextDocumentNumber(tx, scope.companyId, 'job_card', year);
      const job = await tx.jobCard.create({
        data: {
          companyId: scope.companyId,
          branchId: input.branchId,
          number: formatDocumentNumber('JC', year, n),
          customerId: vehicle.customerId,
          vehicleId: vehicle.id,
          complaint: input.complaint,
          odometerIn: input.odometerIn,
          fuelLevel: input.fuelLevel,
          promisedAt: input.promisedAt ? new Date(input.promisedAt) : null,
          createdBy: p.userId,
          tasks: {
            create: input.tasks.map((t, i) => ({
              lineNo: i + 1,
              description: t.description,
              estimatedHours: t.estimatedHours,
            })),
          },
        },
      });
      if (input.appointmentId) {
        // Check-in of a booked appointment: lock it, check it matches, link both ways.
        const [appt] = await tx.$queryRaw<
          { id: string; status: string; vehicle_id: string; branch_id: string }[]
        >`
          SELECT id, status, vehicle_id, branch_id FROM workshop.appointment
           WHERE id = ${input.appointmentId}::uuid AND company_id = ${scope.companyId}::uuid FOR UPDATE`;
        if (!appt) throw unprocessable('appointmentId is not an appointment of this company');
        if (appt.status !== 'booked')
          throw conflict(`This appointment is ${appt.status.replace('_', ' ')}, not booked`);
        if (appt.vehicle_id !== vehicle.id || appt.branch_id !== input.branchId) {
          throw unprocessable('The appointment is for another vehicle or branch');
        }
        await tx.appointment.update({
          where: { id: appt.id },
          data: { status: 'checked_in', jobId: job.id, version: { increment: 1 } },
        });
      }
      await this.event(tx, job, p.userId, { kind: 'created', toStatus: 'draft' });
      await writeAudit(tx, ctx, {
        action: 'workshop.job.create',
        entityType: 'job_card',
        entityId: job.id,
        companyId: scope.companyId,
        branchId: input.branchId,
        after: { number: job.number, ...input },
      });
      await this.outbox(tx, ctx, job, 'workshop.job.created', {});
      return job.id;
    });
    return this.get(scope, p, id);
  }

  async updateDraft(
    scope: CompanyScope,
    p: Principal,
    id: string,
    input: UpdateJobDraftInput,
    ctx: AuditContext,
  ) {
    return this.act(scope, p, id, 'edit', input.version, ctx, async (tx) => {
      await tx.jobTask.deleteMany({ where: { jobId: id } });
      await tx.jobCard.update({
        where: { id },
        data: {
          complaint: input.complaint,
          odometerIn: input.odometerIn,
          fuelLevel: input.fuelLevel,
          promisedAt: input.promisedAt ? new Date(input.promisedAt) : null,
          tasks: {
            create: input.tasks.map((t, i) => ({
              lineNo: i + 1,
              description: t.description,
              estimatedHours: t.estimatedHours,
            })),
          },
        },
      });
      return { event: { kind: 'updated' }, audit: { action: 'workshop.job.update', after: input } };
    });
  }

  async authorize(
    scope: CompanyScope,
    p: Principal,
    id: string,
    input: AuthorizeJobInput,
    ctx: AuditContext,
  ) {
    return this.act(scope, p, id, 'authorize', input.version, ctx, async (tx, job) => {
      if (job.tasks.length === 0) throw unprocessable('Add at least one task before authorisation');
      if (!job.inspectedAt) throw unprocessable('Record the check-in inspection before authorisation');
      const next = statusAfterAssignment(
        'approved',
        job.tasks.every((t) => t.technicianId),
      );
      await tx.jobCard.update({
        where: { id },
        data: {
          status: next,
          authorizedByName: input.authorizedByName,
          authorizedVia: input.authorizedVia,
          authorizedAt: new Date(),
          authorizationRecordedBy: p.userId,
        },
      });
      return {
        event: {
          kind: 'status',
          toStatus: next,
          note: input.authorizedByName,
          data: { authorizedVia: input.authorizedVia },
        },
        audit: { action: 'workshop.job.authorize', after: { ...input, status: next } },
      };
    });
  }

  async assignTask(
    scope: CompanyScope,
    p: Principal,
    id: string,
    taskId: string,
    input: AssignTaskInput,
    ctx: AuditContext,
  ) {
    return this.act(scope, p, id, 'assign', input.version, ctx, async (tx, job) => {
      const task = job.tasks.find((t) => t.id === taskId);
      if (!task) throw notFound('Task');
      if (task.status === 'done') throw conflict('This task is already done');
      if (input.technicianId) {
        const eligible = await this.eligibleTechnicians(tx, job.companyId, job.branchId);
        if (!eligible.some((t) => t.id === input.technicianId)) {
          throw unprocessable('This person cannot work on jobs at this branch');
        }
      }
      if (task.technicianId !== input.technicianId) await closeOpenEntries(tx, { taskId }, p.userId); // the previous technician stops on this task
      await tx.jobTask.update({ where: { id: taskId }, data: { technicianId: input.technicianId } });
      const all = job.tasks.every((t) => (t.id === taskId ? !!input.technicianId : !!t.technicianId));
      const next = statusAfterAssignment(job.status as JobStatus, all);
      if (next !== job.status) await tx.jobCard.update({ where: { id }, data: { status: next } });
      if (input.technicianId) {
        await this.outbox(tx, ctx, job, 'workshop.task.assigned', {
          taskId,
          technicianId: input.technicianId,
        });
      }
      return {
        event: {
          kind: 'assignment',
          toStatus: next !== job.status ? next : undefined,
          data: { taskId, technicianId: input.technicianId },
        },
        audit: {
          action: 'workshop.job.assign',
          after: { taskId, technicianId: input.technicianId, status: next },
        },
      };
    });
  }

  async start(scope: CompanyScope, p: Principal, id: string, input: JobVersionInput, ctx: AuditContext) {
    return this.transition(scope, p, id, 'start', input.version, 'in_progress', ctx);
  }

  async completeTask(
    scope: CompanyScope,
    p: Principal,
    id: string,
    taskId: string,
    input: JobVersionInput,
    ctx: AuditContext,
  ) {
    return this.act(
      scope,
      p,
      id,
      'completeTask',
      input.version,
      ctx,
      async (tx, job) => {
        const task = job.tasks.find((t) => t.id === taskId);
        if (!task) throw notFound('Task');
        if (task.status === 'done') throw conflict('This task is already done');
        await closeOpenEntries(tx, { taskId }, p.userId);
        await tx.jobTask.update({
          where: { id: taskId },
          data: { status: 'done', doneAt: new Date(), doneBy: p.userId },
        });
        return {
          event: { kind: 'task_done', data: { taskId }, note: task.description },
          audit: { action: 'workshop.task.complete', after: { taskId } },
        };
      },
      taskId,
    );
  }

  async submitQc(scope: CompanyScope, p: Principal, id: string, input: JobVersionInput, ctx: AuditContext) {
    return this.act(scope, p, id, 'submitQc', input.version, ctx, async (tx, job) => {
      if (job.tasks.some((t) => t.status !== 'done'))
        throw unprocessable('Finish every task before the quality check');
      await tx.jobCard.update({ where: { id }, data: { status: 'qc' } });
      return {
        event: { kind: 'status', toStatus: 'qc' },
        audit: { action: 'workshop.job.submit_qc', after: { status: 'qc' } },
      };
    });
  }

  async qc(scope: CompanyScope, p: Principal, id: string, input: QcResultInput, ctx: AuditContext) {
    return this.act(scope, p, id, 'qc', input.version, ctx, async (tx, job) => {
      if (input.result === 'pass') {
        await tx.jobCard.update({ where: { id }, data: { status: 'ready' } });
        await this.outbox(tx, ctx, job, 'workshop.job.ready', {});
        return {
          event: { kind: 'qc_pass', toStatus: 'ready', note: input.note ?? undefined },
          audit: { action: 'workshop.job.qc_pass', after: { note: input.note } },
        };
      }
      const reopen = job.tasks.filter((t) => input.reopenTaskIds.includes(t.id));
      if (reopen.length !== new Set(input.reopenTaskIds).size)
        throw unprocessable('reopenTaskIds must be tasks of this job');
      await tx.jobTask.updateMany({
        where: { id: { in: reopen.map((t) => t.id) } },
        data: { status: 'open', doneAt: null, doneBy: null },
      });
      await tx.jobCard.update({ where: { id }, data: { status: 'rework', reworkCount: { increment: 1 } } });
      const technicianIds = [...new Set(reopen.flatMap((t) => (t.technicianId ? [t.technicianId] : [])))];
      await this.outbox(tx, ctx, job, 'workshop.job.rework', {
        technicianIds,
        taskIds: reopen.map((t) => t.id),
      });
      return {
        event: {
          kind: 'qc_fail',
          toStatus: 'rework',
          note: input.note,
          data: { reopenTaskIds: input.reopenTaskIds },
        },
        audit: {
          action: 'workshop.job.qc_fail',
          reason: input.note,
          after: { reopenTaskIds: input.reopenTaskIds },
        },
      };
    });
  }

  async deliver(scope: CompanyScope, p: Principal, id: string, input: DeliverJobInput, ctx: AuditContext) {
    return this.act(scope, p, id, 'deliver', input.version, ctx, async (tx, job) => {
      if (input.odometerOut < job.odometerIn) {
        throw unprocessable(`The odometer cannot be lower than at check-in (${job.odometerIn})`);
      }
      await tx.jobCard.update({
        where: { id },
        data: {
          status: 'delivered',
          deliveredToName: input.deliveredToName,
          deliveredAt: new Date(),
          odometerOut: input.odometerOut,
        },
      });
      return {
        event: { kind: 'status', toStatus: 'delivered', note: input.deliveredToName },
        audit: { action: 'workshop.job.deliver', after: input },
      };
    });
  }

  async cancel(scope: CompanyScope, p: Principal, id: string, input: CancelJobInput, ctx: AuditContext) {
    return this.act(scope, p, id, 'cancel', input.version, ctx, async (tx) => {
      // No parts or deposits exist yet (inventory and invoicing come later), so nothing to return.
      await closeOpenEntries(tx, { jobId: id }, p.userId);
      await tx.jobCard.update({
        where: { id },
        data: { status: 'cancelled', cancelledReason: input.reason },
      });
      return {
        event: { kind: 'status', toStatus: 'cancelled', note: input.reason },
        audit: { action: 'workshop.job.cancel', reason: input.reason },
      };
    });
  }

  async promise(scope: CompanyScope, p: Principal, id: string, input: PromiseJobInput, ctx: AuditContext) {
    return this.act(scope, p, id, 'promise', input.version, ctx, async (tx) => {
      await tx.jobCard.update({
        where: { id },
        data: { promisedAt: input.promisedAt ? new Date(input.promisedAt) : null },
      });
      return {
        event: {
          kind: 'updated',
          note: input.promisedAt ?? undefined,
          data: { promisedAt: input.promisedAt },
        },
        audit: { action: 'workshop.job.promise', after: input },
      };
    });
  }

  /** Notes do not change the job (allowed on closed jobs too), so they need no version. */
  /** The whole check-in checklist (draft only); replaces an earlier answer. */
  async recordInspection(
    scope: CompanyScope,
    p: Principal,
    id: string,
    input: RecordInspectionInput,
    ctx: AuditContext,
  ) {
    return this.act(scope, p, id, 'inspect', input.version, ctx, async (tx, job) => {
      await tx.inspectionItem.deleteMany({ where: { jobId: id } });
      await tx.inspectionItem.createMany({
        data: input.items.map((i) => ({
          companyId: job.companyId,
          jobId: id,
          itemKey: i.key,
          status: i.status,
          note: i.note ?? null,
        })),
      });
      await tx.jobCard.update({ where: { id }, data: { inspectedAt: new Date(), inspectedBy: p.userId } });
      const attention = input.items.filter((i) => i.status === 'attention').length;
      return {
        event: { kind: 'inspection', data: { attention } },
        audit: { action: 'workshop.job.inspect', after: { items: input.items } },
      };
    });
  }

  /**
   * Adds photos. Each file is decoded and re-encoded first (outside the transaction), so nothing
   * is stored unless every file is a valid image. Photos do not change the job (no version).
   */
  async addPhotos(
    scope: CompanyScope,
    p: Principal,
    id: string,
    files: { buffer: Buffer; originalname: string }[],
    meta: PhotoMetaInput,
    ctx: AuditContext,
  ): Promise<JobCardDto> {
    if (files.length === 0) throw unprocessable('Choose at least one photo');
    if (files.length > PHOTO_LIMITS.maxPerUpload)
      throw unprocessable(`At most ${PHOTO_LIMITS.maxPerUpload} photos at a time`);
    const job = await this.load(this.prisma, scope, id);
    if (!allowedInStatus('addPhoto', job.status as JobStatus)) {
      throw conflict(`Photos cannot be added while the job is ${job.status.replace('_', ' ')}`);
    }
    if (!permits('addPhoto', await this.actorFor(p, job)))
      throw forbidden('You cannot add photos to this job');
    const processed: ProcessedPhoto[] = [];
    for (const f of files) processed.push(await processPhoto(f.buffer));
    await this.prisma.$transaction(async (tx) => {
      // Serialise uploads per job so the per-job limit holds under concurrency.
      await tx.$executeRaw`SELECT 1 FROM workshop.job_card WHERE id = ${id}::uuid FOR UPDATE`;
      const existing = await tx.jobPhoto.count({ where: { jobId: id } });
      if (existing + processed.length > PHOTO_LIMITS.maxPerJob) {
        throw unprocessable(`A job can hold at most ${PHOTO_LIMITS.maxPerJob} photos (${existing} already)`);
      }
      const ids: string[] = [];
      for (const ph of processed) {
        const row = await tx.jobPhoto.create({
          data: {
            companyId: job.companyId,
            jobId: id,
            area: meta.area,
            caption: meta.caption ?? null,
            content: new Uint8Array(ph.content),
            thumbnail: new Uint8Array(ph.thumbnail),
            width: ph.width,
            height: ph.height,
            sizeBytes: ph.content.length,
            sha256: ph.sha256,
            uploadedBy: p.userId,
          },
          select: { id: true },
        });
        ids.push(row.id);
      }
      await this.event(tx, job, p.userId, {
        kind: 'photo_added',
        note: meta.caption ?? undefined,
        data: { count: ids.length, area: meta.area },
      });
      await writeAudit(tx, ctx, {
        action: 'workshop.job.photo_add',
        entityType: 'job_card',
        entityId: id,
        companyId: job.companyId,
        branchId: job.branchId,
        after: {
          photoIds: ids,
          area: meta.area,
          caption: meta.caption,
          sha256: processed.map((x) => x.sha256),
        },
      });
    });
    return this.get(scope, p, id);
  }

  async removePhoto(
    scope: CompanyScope,
    p: Principal,
    id: string,
    photoId: string,
    ctx: AuditContext,
  ): Promise<JobCardDto> {
    const job = await this.load(this.prisma, scope, id);
    if (!allowedInStatus('removePhoto', job.status as JobStatus)) {
      throw conflict('Photos are evidence once work is authorised and cannot be removed');
    }
    if (!permits('removePhoto', await this.actorFor(p, job)))
      throw forbidden('Only workshop managers remove photos');
    await this.prisma.$transaction(async (tx) => {
      const photo = await tx.jobPhoto.findFirst({
        where: { id: photoId, jobId: id },
        select: { id: true, area: true, sha256: true },
      });
      if (!photo) throw notFound('Photo');
      await tx.jobPhoto.delete({ where: { id: photoId } });
      await this.event(tx, job, p.userId, { kind: 'photo_removed', data: { photoId, area: photo.area } });
      await writeAudit(tx, ctx, {
        action: 'workshop.job.photo_remove',
        entityType: 'job_card',
        entityId: id,
        companyId: job.companyId,
        branchId: job.branchId,
        before: photo,
      });
    });
    return this.get(scope, p, id);
  }

  /** The image bytes, for people who may see the job. */
  async photo(scope: CompanyScope, id: string, photoId: string, size: 'full' | 'thumb'): Promise<Buffer> {
    await this.load(this.prisma, scope, id);
    const photo = await this.prisma.jobPhoto.findFirst({
      where: { id: photoId, jobId: id },
      select: size === 'thumb' ? { thumbnail: true } : { content: true },
    });
    if (!photo) throw notFound('Photo');
    return Buffer.from(
      (photo as { thumbnail?: Uint8Array; content?: Uint8Array }).thumbnail ??
        (photo as { content: Uint8Array }).content,
    );
  }

  async addNote(
    scope: CompanyScope,
    p: Principal,
    id: string,
    input: JobNoteInput,
    ctx: AuditContext,
  ): Promise<JobCardDto> {
    const job = await this.load(this.prisma, scope, id);
    const actor = await this.actorFor(p, job);
    if (!permits('note', actor)) throw forbidden('You cannot add notes to this job');
    await this.prisma.$transaction(async (tx) => {
      await this.event(tx, job, p.userId, { kind: 'note', note: input.note });
      await writeAudit(tx, ctx, {
        action: 'workshop.job.note',
        entityType: 'job_card',
        entityId: id,
        companyId: job.companyId,
        branchId: job.branchId,
        after: input,
      });
    });
    return this.get(scope, p, id);
  }

  // ── internals ────────────────────────────────────────────────────────────

  private transition(
    scope: CompanyScope,
    p: Principal,
    id: string,
    action: JobAction,
    version: number,
    to: JobStatus,
    ctx: AuditContext,
  ) {
    return this.act(scope, p, id, action, version, ctx, async (tx) => {
      await tx.jobCard.update({ where: { id }, data: { status: to } });
      return {
        event: { kind: 'status', toStatus: to },
        audit: { action: `workshop.job.${action}`, after: { status: to } },
      };
    });
  }

  /**
   * Shared frame for every change: the job in the caller's branch scope (404 otherwise), the status
   * allows the action (409), the caller may do it (403), the version matches (409); then the
   * mutation, version bump, timeline event and audit in one transaction.
   */
  private async act(
    scope: CompanyScope,
    p: Principal,
    id: string,
    action: JobAction,
    version: number,
    ctx: AuditContext,
    mutate: (
      tx: Tx,
      job: JobRow,
    ) => Promise<{
      event: { kind: string; toStatus?: string; note?: string; data?: Record<string, unknown> };
      audit: { action: string; reason?: string; after?: unknown };
    }>,
    taskId?: string,
  ): Promise<JobCardDto> {
    await this.prisma.$transaction(async (tx) => {
      const job = await this.load(tx, scope, id);
      if (!allowedInStatus(action, job.status as JobStatus)) {
        throw conflict(`This is not possible while the job is ${job.status.replace('_', ' ')}`);
      }
      const actor = await this.actorFor(p, job, taskId);
      if (!permits(action, actor)) {
        throw forbidden(
          action === 'qc' && actor.qc && actor.onJob
            ? 'You worked on this job; another inspector must check it'
            : 'You are not allowed to do this on this job',
        );
      }
      const bumped = await tx.jobCard.updateMany({
        where: { id, version },
        data: { version: { increment: 1 } },
      });
      if (bumped.count === 0) throw conflict('This job was changed by someone else; reload and try again');
      const r = await mutate(tx, job);
      await this.event(tx, job, p.userId, {
        ...r.event,
        fromStatus: r.event.toStatus ? job.status : undefined,
      });
      await writeAudit(tx, ctx, {
        action: r.audit.action,
        entityType: 'job_card',
        entityId: id,
        companyId: job.companyId,
        branchId: job.branchId,
        reason: r.audit.reason,
        before: { status: job.status, version },
        after: r.audit.after,
      });
      if (r.event.toStatus) {
        await this.outbox(tx, ctx, job, 'workshop.job.status_changed', {
          from: job.status,
          to: r.event.toStatus,
        });
      }
    });
    return this.get(scope, p, id);
  }

  private async load(db: Tx | PrismaService, scope: CompanyScope, id: string): Promise<JobRow> {
    const job = await db.jobCard.findUnique({
      where: { companyId_id: { companyId: scope.companyId, id } },
      include: jobInclude,
    });
    if (!job || (!scope.allBranches && !scope.branchIds.includes(job.branchId))) throw notFound('Job card');
    return job;
  }

  private async actorFor(p: Principal, job: JobRow, taskId?: string): Promise<Actor> {
    const grants = await this.authz.grants(p.userId, job.companyId);
    const can = (perm: string) => covers(grants, job.companyId, perm, job.branchId);
    return {
      manage: can('workshop.job.manage'),
      work: can('workshop.job.work'),
      qc: can('workshop.job.qc'),
      onJob: job.tasks.some((t) => t.technicianId === p.userId),
      onTask: taskId ? job.tasks.some((t) => t.id === taskId && t.technicianId === p.userId) : false,
    };
  }

  /** Active people whose roles allow workshop work at the job's branch. */
  async eligibleTechnicians(
    db: Tx | PrismaService,
    companyId: string,
    branchId: string,
  ): Promise<TechnicianDto[]> {
    const rows = await db.roleAssignment.findMany({
      where: {
        companyId,
        OR: [{ branchId: null }, { branchId }],
        role: { permissions: { has: 'workshop.job.work' } },
        user: { status: 'active' },
      },
      select: { user: { select: { id: true, displayName: true } } },
    });
    const byId = new Map(rows.map((r) => [r.user.id, r.user]));
    return [...byId.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  private async userNames(ids: (string | null)[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((x): x is string => !!x))];
    if (!unique.length) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, displayName: true },
    });
    return new Map(users.map((u) => [u.id, u.displayName]));
  }

  private event(
    tx: Tx,
    job: { id: string; companyId: string },
    actorUserId: string,
    e: {
      kind: string;
      fromStatus?: string;
      toStatus?: string;
      note?: string;
      data?: Record<string, unknown>;
    },
  ) {
    return tx.jobEvent.create({
      data: {
        companyId: job.companyId,
        jobId: job.id,
        actorUserId,
        kind: e.kind,
        fromStatus: e.fromStatus ?? null,
        toStatus: e.toStatus ?? null,
        note: e.note ?? null,
        data: (e.data ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }

  private outbox(
    tx: Tx,
    ctx: AuditContext,
    job: { id: string; companyId: string },
    eventType: string,
    payload: Record<string, unknown>,
  ) {
    return enqueueOutbox(tx, ctx, {
      companyId: job.companyId,
      aggregateType: 'job_card',
      aggregateId: job.id,
      eventType,
      payload: { jobId: job.id, ...payload },
    });
  }

  private async toDto(job: JobRow, actor: Actor, userId: string): Promise<JobCardDto> {
    const events = await this.prisma.jobEvent.findMany({
      where: { jobId: job.id },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    });
    const [items, photos] = await Promise.all([
      this.prisma.inspectionItem.findMany({ where: { jobId: job.id } }),
      this.prisma.jobPhoto.findMany({
        where: { jobId: job.id },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          area: true,
          caption: true,
          width: true,
          height: true,
          sizeBytes: true,
          uploadedBy: true,
          createdAt: true,
        },
      }),
    ]);
    const entries = await this.prisma.taskTimeEntry.findMany({
      where: { jobId: job.id },
      orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
    });
    const names = await this.userNames([
      ...entries.flatMap((e) => [e.technicianId, e.createdBy, e.voidedBy]),
      job.inspectedBy,
      ...photos.map((ph) => ph.uploadedBy),
      job.createdBy,
      ...job.tasks.map((t) => t.technicianId),
      ...events.map((e) => e.actorUserId),
    ]);
    const status = job.status as JobStatus;
    const hours = job.tasks.reduce((s, t) => s.plus(t.estimatedHours), new Prisma.Decimal(0));
    const now = new Date();
    const counted = entries.filter((e) => e.endedAt && !e.voidedAt);
    const secondsOn = (taskId?: string) =>
      counted.filter((e) => !taskId || e.taskId === taskId).reduce((n, e) => n + spanSeconds(e, now), 0);
    const open = entries.filter((e) => !e.endedAt);
    const workable = allowedInStatus('completeTask', status);
    const lineOf = new Map(job.tasks.map((t) => [t.id, t.lineNo]));
    return {
      id: job.id,
      number: job.number,
      status,
      branchId: job.branchId,
      branchCode: job.branch.code,
      customer: job.customer,
      vehicle: job.vehicle,
      complaint: job.complaint,
      odometerIn: job.odometerIn,
      fuelLevel: job.fuelLevel,
      promisedAt: job.promisedAt?.toISOString() ?? null,
      overdue: isOverdue(status, job.promisedAt),
      authorizedByName: job.authorizedByName,
      authorizedVia: job.authorizedVia,
      authorizedAt: job.authorizedAt?.toISOString() ?? null,
      reworkCount: job.reworkCount,
      deliveredToName: job.deliveredToName,
      deliveredAt: job.deliveredAt?.toISOString() ?? null,
      odometerOut: job.odometerOut,
      cancelledReason: job.cancelledReason,
      createdByName: names.get(job.createdBy) ?? '—',
      createdAt: job.createdAt.toISOString(),
      version: job.version,
      estimatedHours: hours.toFixed(2),
      tasks: job.tasks.map((t) => ({
        id: t.id,
        lineNo: t.lineNo,
        description: t.description,
        estimatedHours: t.estimatedHours.toFixed(2),
        technicianId: t.technicianId,
        technicianName: t.technicianId ? (names.get(t.technicianId) ?? '—') : null,
        status: t.status,
        doneAt: t.doneAt?.toISOString() ?? null,
        canComplete:
          t.status === 'open' &&
          allowedInStatus('completeTask', status) &&
          permits('completeTask', { ...actor, onTask: t.technicianId === userId }),
        actualHours: toHours(secondsOn(t.id)),
        clockedOn: open
          .filter((e) => e.taskId === t.id)
          .map((e) => ({
            entryId: e.id,
            technicianName: names.get(e.technicianId) ?? '—',
            since: e.startedAt.toISOString(),
          })),
        canClockOn:
          workable &&
          t.status === 'open' &&
          actor.work &&
          t.technicianId === userId &&
          !open.some((e) => e.technicianId === userId),
        myOpenEntryId: open.find((e) => e.taskId === t.id && e.technicianId === userId)?.id ?? null,
      })),
      events: events.map((e) => ({
        id: e.id,
        occurredAt: e.occurredAt.toISOString(),
        actorName: names.get(e.actorUserId) ?? '—',
        kind: e.kind,
        fromStatus: e.fromStatus,
        toStatus: e.toStatus,
        note: e.note,
      })),
      actions: availableActions(status, actor),
      inspection: job.inspectedAt
        ? {
            recordedAt: job.inspectedAt.toISOString(),
            recordedByName: names.get(job.inspectedBy ?? '') ?? '—',
            // In checklist order, whatever order they were stored in.
            items: INSPECTION_ITEMS.flatMap((def) => {
              const it = items.find((i) => i.itemKey === def.key);
              return it ? [{ key: it.itemKey, status: it.status, note: it.note }] : [];
            }),
          }
        : null,
      photos: photos.map((ph) => ({
        id: ph.id,
        area: ph.area,
        caption: ph.caption,
        width: ph.width,
        height: ph.height,
        sizeBytes: ph.sizeBytes,
        uploadedByName: names.get(ph.uploadedBy) ?? '—',
        createdAt: ph.createdAt.toISOString(),
      })),
      actualHours: toHours(secondsOn()),
      timeEntries: entries.map((e) => ({
        id: e.id,
        taskId: e.taskId,
        taskLineNo: lineOf.get(e.taskId) ?? 0,
        technicianId: e.technicianId,
        technicianName: names.get(e.technicianId) ?? '—',
        startedAt: e.startedAt.toISOString(),
        endedAt: e.endedAt?.toISOString() ?? null,
        minutes: toMinutes(spanSeconds(e, now)),
        source: e.source,
        reason: e.reason,
        createdByName: names.get(e.createdBy) ?? '—',
        voided: !!e.voidedAt,
        voidReason: e.voidReason,
        voidedByName: e.voidedBy ? (names.get(e.voidedBy) ?? '—') : null,
        canVoid: actor.manage && !!e.endedAt && !e.voidedAt && e.technicianId !== userId,
        canStop: !e.endedAt && (actor.manage || e.technicianId === userId),
      })),
      canRecordTime: actor.manage && (TIME_ENTRY_STATUSES as readonly string[]).includes(status),
    };
  }
}
