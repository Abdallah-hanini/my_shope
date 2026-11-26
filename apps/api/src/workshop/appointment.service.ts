import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  AppointmentDayQuery,
  CancelAppointmentInput,
  CreateAppointmentInput,
  JobVersionInput,
  RescheduleAppointmentInput,
  WorkshopScheduleInput,
} from '@erp/validation';
import type { CompanyScope, Principal } from '../auth/principal';
import { AuthzService } from '../authz/authz.service';
import { resolveScope } from '../authz/scope';
import { conflict, forbidden, notFound, unprocessable } from '../common/errors';
import { PrismaService } from '../infra/prisma.service';
import { writeAudit, type AuditContext } from '../platform/audit';
import { enqueueOutbox } from '../platform/outbox';
import type { AppointmentDayDto, AppointmentDto, WorkshopScheduleDto } from './appointment.dto';
import { clock, daySlots, peakOverlap, timeProblem, zonedInstant, type Schedule } from './scheduling';

type Tx = Prisma.TransactionClient;
const include = {
  branch: { select: { code: true } },
  customer: { select: { id: true, name: true, nameAr: true, phone: true } },
  vehicle: { select: { id: true, plate: true, make: true, model: true, year: true } },
  job: { select: { number: true } },
} satisfies Prisma.AppointmentInclude;
type Row = Prisma.AppointmentGetPayload<{ include: typeof include }>;
/** Appointments that take a bay. */
const ACTIVE = ['booked', 'checked_in'];
const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

/**
 * Appointments (WMS-002). Times must fit the branch's opening hours and slot grid; the number of
 * cars booked at once never exceeds the bays (bookings of a branch are serialised by locking its
 * schedule row); a vehicle is never booked twice at the same time.
 */
@Injectable()
export class AppointmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthzService,
  ) {}

  private inScope(scope: CompanyScope, branchId: string) {
    if (!scope.allBranches && !scope.branchIds.includes(branchId)) throw notFound('Branch');
  }

  private async canManage(p: Principal, companyId: string, branchId: string) {
    const s = resolveScope(companyId, 'workshop.job.manage', await this.authz.grants(p.userId, companyId));
    return !!s && (s.allBranches || s.branchIds.includes(branchId));
  }

  private async loadSchedule(
    db: Tx | PrismaService,
    companyId: string,
    branchId: string,
  ): Promise<WorkshopScheduleDto & { rule: Schedule | null }> {
    const [sched, hours] = await Promise.all([
      db.workshopSchedule.findUnique({ where: { branchId } }),
      db.workshopHours.findMany({ where: { branchId, companyId }, orderBy: { weekday: 'asc' } }),
    ]);
    return {
      branchId,
      configured: !!sched && hours.length > 0,
      bays: sched?.bays ?? 0,
      slotMinutes: sched?.slotMinutes ?? 30,
      hours: hours.map((h) => ({
        weekday: h.weekday,
        opens: clock(h.opensMinute),
        closes: clock(h.closesMinute),
      })),
      version: sched?.version ?? 0,
      rule: sched && hours.length ? { bays: sched.bays, slotMinutes: sched.slotMinutes, hours } : null,
    };
  }

  async schedule(scope: CompanyScope, branchId: string): Promise<WorkshopScheduleDto> {
    this.inScope(scope, branchId);
    const branch = await this.prisma.branch.findUnique({
      where: { companyId_id: { companyId: scope.companyId, id: branchId } },
    });
    if (!branch) throw notFound('Branch');
    const { rule: _rule, ...dto } = await this.loadSchedule(this.prisma, scope.companyId, branchId);
    return dto;
  }

  async setSchedule(
    scope: CompanyScope,
    p: Principal,
    branchId: string,
    input: WorkshopScheduleInput,
    ctx: AuditContext,
  ): Promise<WorkshopScheduleDto> {
    this.inScope(scope, branchId);
    if (!(await this.canManage(p, scope.companyId, branchId)))
      throw forbidden('Only workshop managers set the hours');
    const branch = await this.prisma.branch.findUnique({
      where: { companyId_id: { companyId: scope.companyId, id: branchId } },
    });
    if (!branch) throw notFound('Branch');
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.workshopSchedule.findUnique({ where: { branchId } });
      if ((current?.version ?? 0) !== input.version)
        throw conflict('The hours were changed by someone else; reload and try again');
      const before = await this.loadSchedule(tx, scope.companyId, branchId);
      if (current) {
        const n = await tx.workshopSchedule.updateMany({
          where: { branchId, version: input.version },
          data: { bays: input.bays, slotMinutes: input.slotMinutes, version: { increment: 1 } },
        });
        if (n.count === 0) throw conflict('The hours were changed by someone else; reload and try again');
      } else {
        await tx.workshopSchedule.create({
          data: { companyId: scope.companyId, branchId, bays: input.bays, slotMinutes: input.slotMinutes },
        });
      }
      await tx.workshopHours.deleteMany({ where: { branchId } });
      await tx.workshopHours.createMany({
        data: input.hours.map((h) => ({
          companyId: scope.companyId,
          branchId,
          weekday: h.weekday,
          opensMinute: toMinutes(h.opens),
          closesMinute: toMinutes(h.closes),
        })),
      });
      // Existing bookings stay as they are; only new bookings and reschedules use the new hours.
      await writeAudit(tx, ctx, {
        action: 'workshop.schedule.set',
        entityType: 'branch',
        entityId: branchId,
        companyId: scope.companyId,
        branchId,
        before: { bays: before.bays, slotMinutes: before.slotMinutes, hours: before.hours },
        after: { bays: input.bays, slotMinutes: input.slotMinutes, hours: input.hours },
      });
    });
    return this.schedule(scope, branchId);
  }

  async day(scope: CompanyScope, p: Principal, q: AppointmentDayQuery): Promise<AppointmentDayDto> {
    this.inScope(scope, q.branchId);
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: scope.companyId } });
    const { rule, ...schedule } = await this.loadSchedule(this.prisma, scope.companyId, q.branchId);
    const from = zonedInstant(q.date, 0, company.timezone);
    const to = zonedInstant(q.date, 24 * 60, company.timezone);
    const rows = await this.prisma.appointment.findMany({
      where: { companyId: scope.companyId, branchId: q.branchId, startsAt: { lt: to }, endsAt: { gt: from } },
      include,
      orderBy: [{ startsAt: 'asc' }, { createdAt: 'asc' }],
    });
    const manage = await this.canManage(p, scope.companyId, q.branchId);
    const active = rows
      .filter((r) => ACTIVE.includes(r.status))
      .map((r) => ({ start: r.startsAt, end: r.endsAt }));
    return {
      branchId: q.branchId,
      date: q.date,
      timeZone: company.timezone,
      schedule,
      slots: rule
        ? daySlots(rule, q.date, company.timezone, active).map((s) => ({
            start: s.start.toISOString(),
            end: s.end.toISOString(),
            booked: s.booked,
            free: s.free,
          }))
        : [],
      appointments: await Promise.all(
        rows.filter((r) => r.startsAt >= from).map((r) => this.toDto(r, manage)),
      ),
    };
  }

  async get(scope: CompanyScope, p: Principal, id: string): Promise<AppointmentDto> {
    const row = await this.prisma.appointment.findUnique({
      where: { companyId_id: { companyId: scope.companyId, id } },
      include,
    });
    if (!row || (!scope.allBranches && !scope.branchIds.includes(row.branchId)))
      throw notFound('Appointment');
    return this.toDto(row, await this.canManage(p, scope.companyId, row.branchId));
  }

  /**
   * Checks that [start, end) can be booked for the vehicle at the branch, inside a transaction
   * that already holds the branch's schedule lock.
   */
  private async assertBookable(
    tx: Tx,
    companyId: string,
    branchId: string,
    vehicleId: string,
    start: Date,
    end: Date,
    timeZone: string,
    exceptId?: string,
  ) {
    const sched = await tx.$queryRaw<{ branch_id: string }[]>`
      SELECT branch_id FROM workshop.workshop_schedule WHERE branch_id = ${branchId}::uuid FOR UPDATE`;
    const { rule } = await this.loadSchedule(tx, companyId, branchId);
    if (!sched.length || !rule)
      throw unprocessable('Set the workshop hours of this branch before booking appointments');
    if (start.getTime() < Date.now() - 60_000) throw unprocessable('The appointment time has already passed');
    const problem = timeProblem(rule, start, end, timeZone);
    if (problem) throw unprocessable(problem);
    const overlapping = await tx.appointment.findMany({
      where: {
        branchId,
        status: { in: ACTIVE },
        startsAt: { lt: end },
        endsAt: { gt: start },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { vehicleId: true, startsAt: true, endsAt: true },
    });
    if (overlapping.some((o) => o.vehicleId === vehicleId))
      throw conflict('This vehicle already has an appointment at that time');
    const peak = peakOverlap(
      overlapping.map((o) => ({ start: o.startsAt, end: o.endsAt })),
      start,
      end,
    );
    if (peak + 1 > rule.bays) {
      throw conflict(`All ${rule.bays} bays are booked for part of that time; choose another time`);
    }
  }

  async create(
    scope: CompanyScope,
    p: Principal,
    input: CreateAppointmentInput,
    ctx: AuditContext,
  ): Promise<AppointmentDto> {
    this.inScope(scope, input.branchId);
    if (!(await this.canManage(p, scope.companyId, input.branchId)))
      throw forbidden('Only workshop managers book appointments');
    const [company, vehicle] = await Promise.all([
      this.prisma.company.findUniqueOrThrow({ where: { id: scope.companyId } }),
      this.prisma.vehicle.findUnique({
        where: { companyId_id: { companyId: scope.companyId, id: input.vehicleId } },
      }),
    ]);
    if (!vehicle || vehicle.status !== 'active')
      throw unprocessable('vehicleId is not an active vehicle of this company');
    const start = new Date(input.startsAt);
    const end = new Date(start.getTime() + input.durationMinutes * 60_000);
    const id = await this.prisma.$transaction(async (tx) => {
      await this.assertBookable(
        tx,
        scope.companyId,
        input.branchId,
        vehicle.id,
        start,
        end,
        company.timezone,
      );
      const a = await tx.appointment.create({
        data: {
          companyId: scope.companyId,
          branchId: input.branchId,
          customerId: vehicle.customerId,
          vehicleId: vehicle.id,
          startsAt: start,
          endsAt: end,
          service: input.service,
          notes: input.notes ?? null,
          createdBy: p.userId,
        },
      });
      await writeAudit(tx, ctx, {
        action: 'workshop.appointment.book',
        entityType: 'appointment',
        entityId: a.id,
        companyId: scope.companyId,
        branchId: input.branchId,
        after: input,
      });
      await enqueueOutbox(tx, ctx, {
        companyId: scope.companyId,
        aggregateType: 'appointment',
        aggregateId: a.id,
        eventType: 'workshop.appointment.booked',
        payload: { appointmentId: a.id },
      });
      return a.id;
    });
    return this.get(scope, p, id);
  }

  private async change(
    scope: CompanyScope,
    p: Principal,
    id: string,
    version: number,
    ctx: AuditContext,
    mutate: (
      tx: Tx,
      a: Row,
      timeZone: string,
    ) => Promise<{ data: Prisma.AppointmentUpdateInput; action: string; reason?: string }>,
  ): Promise<AppointmentDto> {
    const row = await this.prisma.appointment.findUnique({
      where: { companyId_id: { companyId: scope.companyId, id } },
      include,
    });
    if (!row || (!scope.allBranches && !scope.branchIds.includes(row.branchId)))
      throw notFound('Appointment');
    if (!(await this.canManage(p, scope.companyId, row.branchId)))
      throw forbidden('Only workshop managers change appointments');
    if (row.status !== 'booked')
      throw conflict(`This appointment is ${row.status.replace('_', ' ')} and cannot be changed`);
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: scope.companyId } });
    await this.prisma.$transaction(async (tx) => {
      const r = await mutate(tx, row, company.timezone);
      const n = await tx.appointment.updateMany({
        where: { id, version, status: 'booked' },
        data: { version: { increment: 1 } },
      });
      if (n.count === 0) throw conflict('This appointment was changed by someone else; reload and try again');
      await tx.appointment.update({ where: { id }, data: r.data });
      await writeAudit(tx, ctx, {
        action: r.action,
        entityType: 'appointment',
        entityId: id,
        companyId: scope.companyId,
        branchId: row.branchId,
        reason: r.reason,
        before: { status: row.status, startsAt: row.startsAt, endsAt: row.endsAt },
        after: r.data,
      });
    });
    return this.get(scope, p, id);
  }

  reschedule(
    scope: CompanyScope,
    p: Principal,
    id: string,
    input: RescheduleAppointmentInput,
    ctx: AuditContext,
  ) {
    return this.change(scope, p, id, input.version, ctx, async (tx, a, tz) => {
      const start = new Date(input.startsAt);
      const end = new Date(start.getTime() + input.durationMinutes * 60_000);
      await this.assertBookable(tx, a.companyId, a.branchId, a.vehicleId, start, end, tz, a.id);
      return { data: { startsAt: start, endsAt: end }, action: 'workshop.appointment.reschedule' };
    });
  }

  cancel(scope: CompanyScope, p: Principal, id: string, input: CancelAppointmentInput, ctx: AuditContext) {
    return this.change(scope, p, id, input.version, ctx, async () => ({
      data: { status: 'cancelled', cancelledReason: input.reason },
      action: 'workshop.appointment.cancel',
      reason: input.reason,
    }));
  }

  noShow(scope: CompanyScope, p: Principal, id: string, input: JobVersionInput, ctx: AuditContext) {
    return this.change(scope, p, id, input.version, ctx, async (_tx, a) => {
      if (a.startsAt.getTime() > Date.now())
        throw unprocessable('A customer can only be marked as not shown after the appointment time');
      return { data: { status: 'no_show' }, action: 'workshop.appointment.no_show' };
    });
  }

  private async toDto(r: Row, manage: boolean): Promise<AppointmentDto> {
    const creator = await this.prisma.user.findUnique({
      where: { id: r.createdBy },
      select: { displayName: true },
    });
    const booked = r.status === 'booked';
    return {
      id: r.id,
      branchId: r.branchId,
      branchCode: r.branch.code,
      customer: r.customer,
      vehicle: r.vehicle,
      startsAt: r.startsAt.toISOString(),
      endsAt: r.endsAt.toISOString(),
      durationMinutes: Math.round((r.endsAt.getTime() - r.startsAt.getTime()) / 60000),
      service: r.service,
      notes: r.notes,
      status: r.status,
      jobId: r.jobId,
      jobNumber: r.job?.number ?? null,
      cancelledReason: r.cancelledReason,
      createdByName: creator?.displayName ?? '—',
      version: r.version,
      actions:
        manage && booked
          ? ['checkIn', 'reschedule', 'cancel', ...(r.startsAt.getTime() <= Date.now() ? ['noShow'] : [])]
          : [],
    };
  }
}
