import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { LabourReportQuery, ManualTimeEntryInput, VoidTimeEntryInput } from '@erp/validation';
import type { CompanyScope, Principal } from '../auth/principal';
import { AuthzService } from '../authz/authz.service';
import { resolveScope } from '../authz/scope';
import { conflict, forbidden, notFound, unprocessable } from '../common/errors';
import { PrismaService } from '../infra/prisma.service';
import { writeAudit, type AuditContext } from '../platform/audit';
import type { CurrentClockDto, JobCardDto, LabourFiguresDto, LabourReportDto } from './job.dto';
import { JobService } from './job.service';
import { summarise, toHours, type TechnicianLabour } from './labour';
import { CLOCK_STATUSES, TIME_ENTRY_STATUSES } from './lifecycle';
import { zonedInstant } from './scheduling';

type Tx = Prisma.TransactionClient;
const RR = { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead };

/** The database refused an overlapping or second open entry (exclusion / unique index). */
const overlaps = (e: unknown) =>
  (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') ||
  (e instanceof Error && /23P01|task_time_entry_no_overlap|task_time_entry_one_open/.test(e.message));

/**
 * Technician labour time (WMS-007, WEB-023). Technicians clock on and off the tasks assigned to
 * them while the job is in progress; a manager clocks off a forgotten timer, enters missed time
 * with a reason, or voids a wrong entry with a reason — never for their own time (T-62). Entries
 * are never edited or deleted; the database refuses overlaps and a second open entry.
 */
@Injectable()
export class LabourService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthzService,
    private readonly jobs: JobService,
  ) {}

  private async can(p: Principal, companyId: string, permission: string, branchId: string) {
    const s = resolveScope(companyId, permission, await this.authz.grants(p.userId, companyId));
    return !!s && (s.allBranches || s.branchIds.includes(branchId));
  }

  /** The job in the caller's scope, locked against concurrent status changes. */
  private async lockJob(tx: Tx, scope: CompanyScope, jobId: string) {
    const rows = await tx.$queryRaw<{ id: string; branch_id: string; status: string; number: string }[]>`
      SELECT id, branch_id, status, number FROM workshop.job_card
       WHERE id = ${jobId}::uuid AND company_id = ${scope.companyId}::uuid FOR UPDATE`;
    const job = rows[0];
    if (!job || (!scope.allBranches && !scope.branchIds.includes(job.branch_id))) throw notFound('Job card');
    return job;
  }

  private async openEntryMessage(tx: Tx, companyId: string, technicianId: string, self: boolean) {
    const open = await tx.taskTimeEntry.findFirst({
      where: { companyId, technicianId, endedAt: null },
      include: { job: { select: { number: true } }, task: { select: { lineNo: true } } },
    });
    const who = self ? 'You are' : 'This technician is';
    return open
      ? `${who} clocked on to ${open.job.number} task ${open.task.lineNo}; clock off there first`
      : `${who} already clocked on`;
  }

  async clockOn(
    scope: CompanyScope,
    p: Principal,
    jobId: string,
    taskId: string,
    ctx: AuditContext,
  ): Promise<JobCardDto> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const job = await this.lockJob(tx, scope, jobId);
        const task = await tx.jobTask.findFirst({ where: { id: taskId, jobId } });
        if (!task) throw notFound('Task');
        if (!(CLOCK_STATUSES as readonly string[]).includes(job.status))
          throw conflict('Time is clocked while the job is in progress');
        if (task.status === 'done') throw conflict('This task is already done');
        if (
          task.technicianId !== p.userId ||
          !(await this.can(p, scope.companyId, 'workshop.job.work', job.branch_id))
        )
          throw forbidden('Only the technician assigned to this task clocks on to it');
        if (
          await tx.taskTimeEntry.count({
            where: { companyId: scope.companyId, technicianId: p.userId, endedAt: null },
          })
        )
          throw conflict(await this.openEntryMessage(tx, scope.companyId, p.userId, true));
        const e = await tx.taskTimeEntry.create({
          data: {
            companyId: scope.companyId,
            branchId: job.branch_id,
            jobId,
            taskId,
            technicianId: p.userId,
            startedAt: new Date(),
            source: 'clock',
            createdBy: p.userId,
          },
        });
        await this.audit(tx, ctx, scope.companyId, job.branch_id, 'workshop.time.clock_on', e.id, {
          jobId,
          taskId,
          startedAt: e.startedAt,
        });
      });
    } catch (e) {
      if (overlaps(e)) throw conflict('You are already clocked on to another task; clock off there first');
      throw e;
    }
    return this.jobs.get(scope, p, jobId);
  }

  /** The technician clocks off, or a manager clocks off a timer someone forgot. */
  async stop(scope: CompanyScope, p: Principal, entryId: string, ctx: AuditContext): Promise<JobCardDto> {
    const jobId = await this.prisma.$transaction(async (tx) => {
      const e = await this.entry(tx, scope, entryId);
      await this.lockJob(tx, scope, e.jobId);
      const own = e.technicianId === p.userId;
      if (!own && !(await this.can(p, scope.companyId, 'workshop.job.manage', e.branchId)))
        throw forbidden('Only the technician or a workshop manager clocks this off');
      const endedAt = new Date();
      const n = await tx.taskTimeEntry.updateMany({
        where: { id: entryId, endedAt: null },
        data: { endedAt, endedBy: p.userId },
      });
      if (n.count === 0) throw conflict('This time entry is already clocked off');
      await this.audit(tx, ctx, scope.companyId, e.branchId, 'workshop.time.clock_off', e.id, {
        endedAt,
        byManager: !own,
      });
      return e.jobId;
    });
    return this.jobs.get(scope, p, jobId);
  }

  /** A manager enters time a technician forgot to clock (never their own). */
  async addManual(
    scope: CompanyScope,
    p: Principal,
    jobId: string,
    input: ManualTimeEntryInput,
    ctx: AuditContext,
  ): Promise<JobCardDto> {
    const startedAt = new Date(input.startedAt);
    const endedAt = new Date(input.endedAt);
    try {
      await this.prisma.$transaction(async (tx) => {
        const job = await this.lockJob(tx, scope, jobId);
        if (!(await this.can(p, scope.companyId, 'workshop.job.manage', job.branch_id)))
          throw forbidden('Only workshop managers enter missed time');
        if (input.technicianId === p.userId)
          throw forbidden('You cannot enter your own time; another manager must do it');
        if (!(TIME_ENTRY_STATUSES as readonly string[]).includes(job.status))
          throw conflict('Time can only be entered once work on the job has started');
        const task = await tx.jobTask.findFirst({ where: { id: input.taskId, jobId } });
        if (!task) throw notFound('Task');
        const eligible = await this.jobs.eligibleTechnicians(tx, scope.companyId, job.branch_id);
        if (!eligible.some((t) => t.id === input.technicianId))
          throw unprocessable('This person cannot work on jobs at this branch');
        const card = await tx.jobCard.findUniqueOrThrow({
          where: { id: jobId },
          select: { createdAt: true },
        });
        if (startedAt < card.createdAt) throw unprocessable('The time starts before the job was opened');
        if (endedAt > new Date()) throw unprocessable('Time cannot be entered in the future');
        const e = await tx.taskTimeEntry.create({
          data: {
            companyId: scope.companyId,
            branchId: job.branch_id,
            jobId,
            taskId: input.taskId,
            technicianId: input.technicianId,
            startedAt,
            endedAt,
            endedBy: p.userId,
            source: 'manual',
            reason: input.reason,
            createdBy: p.userId,
          },
        });
        await this.audit(
          tx,
          ctx,
          scope.companyId,
          job.branch_id,
          'workshop.time.manual',
          e.id,
          { jobId, ...input },
          input.reason,
        );
      });
    } catch (e) {
      if (overlaps(e)) throw conflict('This overlaps other time of the same technician');
      throw e;
    }
    return this.jobs.get(scope, p, jobId);
  }

  /** A wrong entry stays on record, voided with a reason by a manager (not for their own time). */
  async void(
    scope: CompanyScope,
    p: Principal,
    entryId: string,
    input: VoidTimeEntryInput,
    ctx: AuditContext,
  ): Promise<JobCardDto> {
    const jobId = await this.prisma.$transaction(async (tx) => {
      const e = await this.entry(tx, scope, entryId);
      await this.lockJob(tx, scope, e.jobId);
      if (!(await this.can(p, scope.companyId, 'workshop.job.manage', e.branchId)))
        throw forbidden('Only workshop managers void time');
      if (e.technicianId === p.userId) throw forbidden('You cannot void your own time; another manager must');
      if (!e.endedAt) throw conflict('Clock this entry off before voiding it');
      const n = await tx.taskTimeEntry.updateMany({
        where: { id: entryId, voidedAt: null },
        data: { voidedAt: new Date(), voidedBy: p.userId, voidReason: input.reason },
      });
      if (n.count === 0) throw conflict('This time entry is already voided');
      await this.audit(tx, ctx, scope.companyId, e.branchId, 'workshop.time.void', e.id, {}, input.reason);
      return e.jobId;
    });
    return this.jobs.get(scope, p, jobId);
  }

  /** What the caller is clocked on to now (any branch of the company they can see). */
  async current(scope: CompanyScope, p: Principal): Promise<CurrentClockDto> {
    const e = await this.prisma.taskTimeEntry.findFirst({
      where: {
        companyId: scope.companyId,
        technicianId: p.userId,
        endedAt: null,
        ...(scope.allBranches ? {} : { branchId: { in: scope.branchIds } }),
      },
      include: {
        job: { select: { number: true, vehicle: { select: { plate: true } } } },
        task: { select: { lineNo: true, description: true } },
      },
    });
    return {
      entry: e
        ? {
            entryId: e.id,
            jobId: e.jobId,
            jobNumber: e.job.number,
            plate: e.job.vehicle.plate,
            taskId: e.taskId,
            taskLineNo: e.task.lineNo,
            taskDescription: e.task.description,
            since: e.startedAt.toISOString(),
          }
        : null,
    };
  }

  /**
   * Labour time per technician for local dates [from, to] (company time zone) in the caller's
   * manage scope. Definitions: docs/KPI_DICTIONARY.md "Labour time". One consistent snapshot.
   */
  async report(scope: CompanyScope, q: LabourReportQuery): Promise<LabourReportDto> {
    if (q.branchId && !scope.allBranches && !scope.branchIds.includes(q.branchId)) throw notFound('Branch');
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: scope.companyId } });
    const tz = company.timezone;
    const lo = zonedInstant(q.from, 0, tz);
    const hi = zonedInstant(q.to, 1440, tz);
    const branch: Prisma.TaskTimeEntryWhereInput = q.branchId
      ? { branchId: q.branchId }
      : scope.allBranches
        ? {}
        : { branchId: { in: scope.branchIds } };
    const asOf = new Date();
    const data = await this.prisma.$transaction(async (tx) => {
      const live = { companyId: scope.companyId, voidedAt: null, ...branch };
      const inRange = await tx.taskTimeEntry.findMany({
        where: { ...live, endedAt: { not: null }, startedAt: { gte: lo, lt: hi } },
      });
      const doneTasks = await tx.jobTask.findMany({
        where: {
          companyId: scope.companyId,
          status: 'done',
          technicianId: { not: null },
          doneAt: { gte: lo, lt: hi },
          job: q.branchId
            ? { branchId: q.branchId }
            : scope.allBranches
              ? {}
              : { branchId: { in: scope.branchIds } },
        },
        select: { id: true, technicianId: true, estimatedHours: true },
      });
      const taskEntries = await tx.taskTimeEntry.findMany({
        where: { ...live, endedAt: { not: null }, taskId: { in: doneTasks.map((t) => t.id) } },
      });
      const open = await tx.taskTimeEntry.findMany({
        where: { ...live, endedAt: null },
        include: { job: { select: { number: true } }, task: { select: { description: true } } },
        orderBy: { startedAt: 'asc' },
      });
      return { inRange, doneTasks, taskEntries, open };
    }, RR);
    const rows = summarise(
      data.inRange,
      data.doneTasks.map((t) => ({ ...t, technicianId: t.technicianId! })),
      data.taskEntries,
      asOf,
    );
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...rows.map((r) => r.technicianId), ...data.open.map((o) => o.technicianId)] } },
      select: { id: true, displayName: true },
    });
    const name = (id: string) => users.find((u) => u.id === id)?.displayName ?? '—';
    const total = rows.reduce<TechnicianLabour>(
      (t, r) => ({
        technicianId: '',
        clockedSeconds: t.clockedSeconds + r.clockedSeconds,
        entries: t.entries + r.entries,
        jobs: 0,
        tasksDone: t.tasksDone + r.tasksDone,
        tasksWithoutTime: t.tasksWithoutTime + r.tasksWithoutTime,
        estimatedSeconds: t.estimatedSeconds + r.estimatedSeconds,
        actualSeconds: t.actualSeconds + r.actualSeconds,
        efficiencyPct: null,
      }),
      {
        technicianId: '',
        clockedSeconds: 0,
        entries: 0,
        jobs: 0,
        tasksDone: 0,
        tasksWithoutTime: 0,
        estimatedSeconds: 0,
        actualSeconds: 0,
        efficiencyPct: null,
      },
    );
    total.jobs = new Set(data.inRange.map((e) => e.jobId)).size;
    total.efficiencyPct = total.actualSeconds
      ? new Prisma.Decimal(total.estimatedSeconds)
          .mul(100)
          .div(total.actualSeconds)
          .toDecimalPlaces(1, Prisma.Decimal.ROUND_HALF_UP)
          .toFixed(1)
      : null;
    return {
      from: q.from,
      to: q.to,
      timeZone: tz,
      branchId: q.branchId ?? null,
      asOf: asOf.toISOString(),
      rows: rows
        .map((r) => ({ technicianId: r.technicianId, technicianName: name(r.technicianId), ...figures(r) }))
        .sort((a, b) => a.technicianName.localeCompare(b.technicianName)),
      totals: figures(total),
      clockedOnNow: data.open.map((o) => ({
        technicianName: name(o.technicianId),
        jobId: o.jobId,
        jobNumber: o.job.number,
        taskDescription: o.task.description,
        since: o.startedAt.toISOString(),
      })),
    };
  }

  private async entry(tx: Tx, scope: CompanyScope, entryId: string) {
    const e = await tx.taskTimeEntry.findFirst({ where: { id: entryId, companyId: scope.companyId } });
    if (!e || (!scope.allBranches && !scope.branchIds.includes(e.branchId))) throw notFound('Time entry');
    return e;
  }

  private audit(
    tx: Tx,
    ctx: AuditContext,
    companyId: string,
    branchId: string,
    action: string,
    entityId: string,
    after: unknown,
    reason?: string,
  ) {
    return writeAudit(tx, ctx, {
      action,
      entityType: 'task_time_entry',
      entityId,
      companyId,
      branchId,
      reason,
      after,
    });
  }
}

function figures(r: TechnicianLabour): LabourFiguresDto {
  return {
    clockedHours: toHours(r.clockedSeconds),
    entries: r.entries,
    jobs: r.jobs,
    tasksDone: r.tasksDone,
    tasksWithoutTime: r.tasksWithoutTime,
    estimatedHours: toHours(r.estimatedSeconds),
    actualHours: toHours(r.actualSeconds),
    efficiencyPct: r.efficiencyPct,
  };
}
