import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CreateBayInput, UpdateBayInput } from '@erp/validation';
import type { CompanyScope, Principal } from '../auth/principal';
import { AuthzService } from '../authz/authz.service';
import { resolveScope } from '../authz/scope';
import { conflict, forbidden, notFound } from '../common/errors';
import { PrismaService } from '../infra/prisma.service';
import { writeAudit, type AuditContext } from '../platform/audit';
import type { BayBoardDto, BayDto, BoardJobDto } from './bay.dto';
import { allowedInStatus, OPEN_STATUSES, permits } from './lifecycle';

const jobSelect = {
  id: true,
  number: true,
  status: true,
  version: true,
  bayId: true,
  createdAt: true,
  vehicle: { select: { plate: true, make: true, model: true } },
  customer: { select: { name: true } },
  tasks: { select: { technicianId: true } },
} satisfies Prisma.JobCardSelect;
type BoardRow = Prisma.JobCardGetPayload<{ select: typeof jobSelect }>;

/**
 * Workshop bays (WEB-022): named per branch by managers; the bay board shows the car on each bay
 * and the open jobs waiting for one. Placing a car is a job action (JobService.placeBay).
 */
@Injectable()
export class BayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthzService,
  ) {}

  private async can(p: Principal, companyId: string, permission: string, branchId: string) {
    const s = resolveScope(companyId, permission, await this.authz.grants(p.userId, companyId));
    return !!s && (s.allBranches || s.branchIds.includes(branchId));
  }

  private async branch(scope: CompanyScope, branchId: string) {
    if (!scope.allBranches && !scope.branchIds.includes(branchId)) throw notFound('Branch');
    const b = await this.prisma.branch.findUnique({
      where: { companyId_id: { companyId: scope.companyId, id: branchId } },
    });
    if (!b) throw notFound('Branch');
  }

  async board(scope: CompanyScope, p: Principal, branchId: string): Promise<BayBoardDto> {
    await this.branch(scope, branchId);
    const [manage, work] = await Promise.all([
      this.can(p, scope.companyId, 'workshop.job.manage', branchId),
      this.can(p, scope.companyId, 'workshop.job.work', branchId),
    ]);
    const [bays, jobs] = await Promise.all([
      this.prisma.bay.findMany({
        where: { companyId: scope.companyId, branchId, ...(manage ? {} : { active: true }) },
        orderBy: { code: 'asc' },
      }),
      this.prisma.jobCard.findMany({
        where: { companyId: scope.companyId, branchId, status: { in: [...OPEN_STATUSES] } },
        select: jobSelect,
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    const names = new Map(
      (
        await this.prisma.user.findMany({
          where: {
            id: {
              in: [...new Set(jobs.flatMap((j) => j.tasks.map((t) => t.technicianId!)))].filter(Boolean),
            },
          },
          select: { id: true, displayName: true },
        })
      ).map((u) => [u.id, u.displayName]),
    );
    const card = (j: BoardRow): BoardJobDto => {
      const techs = [...new Set(j.tasks.map((t) => t.technicianId).filter((x): x is string => !!x))];
      const onJob = techs.includes(p.userId);
      return {
        id: j.id,
        number: j.number,
        status: j.status,
        version: j.version,
        plate: j.vehicle.plate,
        vehicleName: `${j.vehicle.make} ${j.vehicle.model}`,
        customerName: j.customer.name,
        technicianNames: techs.map((t) => names.get(t) ?? '—'),
        canPlace:
          allowedInStatus('placeBay', j.status as never) &&
          permits('placeBay', { manage, work, qc: false, onJob }),
      };
    };
    return {
      branchId,
      canManage: manage,
      bays: bays.map(
        (b): BayDto => ({
          id: b.id,
          code: b.code,
          name: b.name,
          active: b.active,
          version: b.version,
          job: (() => {
            const j = jobs.find((x) => x.bayId === b.id);
            return j ? card(j) : null;
          })(),
        }),
      ),
      waiting: jobs.filter((j) => !j.bayId).map(card),
    };
  }

  async create(
    scope: CompanyScope,
    p: Principal,
    branchId: string,
    input: CreateBayInput,
    ctx: AuditContext,
  ): Promise<BayBoardDto> {
    await this.branch(scope, branchId);
    if (!(await this.can(p, scope.companyId, 'workshop.job.manage', branchId)))
      throw forbidden('Only workshop managers set up bays');
    try {
      await this.prisma.$transaction(async (tx) => {
        const b = await tx.bay.create({ data: { companyId: scope.companyId, branchId, ...input } });
        await writeAudit(tx, ctx, {
          action: 'workshop.bay.create',
          entityType: 'bay',
          entityId: b.id,
          companyId: scope.companyId,
          branchId,
          after: input,
        });
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
        throw conflict(`Bay ${input.code} already exists at this branch`);
      throw e;
    }
    return this.board(scope, p, branchId);
  }

  async update(
    scope: CompanyScope,
    p: Principal,
    bayId: string,
    input: UpdateBayInput,
    ctx: AuditContext,
  ): Promise<BayBoardDto> {
    const bay = await this.prisma.bay.findFirst({
      where: { id: bayId, companyId: scope.companyId },
      include: { jobs: { select: { number: true } } },
    });
    if (!bay || (!scope.allBranches && !scope.branchIds.includes(bay.branchId))) throw notFound('Bay');
    if (!(await this.can(p, scope.companyId, 'workshop.job.manage', bay.branchId)))
      throw forbidden('Only workshop managers set up bays');
    if (bay.active && !input.active && bay.jobs.length)
      throw conflict(`Bay ${bay.code} has ${bay.jobs[0]!.number} on it; move the car first`);
    await this.prisma.$transaction(async (tx) => {
      const n = await tx.bay.updateMany({
        where: { id: bayId, version: input.version },
        data: { name: input.name, active: input.active, version: { increment: 1 } },
      });
      if (n.count === 0) throw conflict('This bay was changed by someone else; reload and try again');
      await writeAudit(tx, ctx, {
        action: 'workshop.bay.update',
        entityType: 'bay',
        entityId: bayId,
        companyId: scope.companyId,
        branchId: bay.branchId,
        before: { name: bay.name, active: bay.active },
        after: { name: input.name, active: input.active },
      });
    });
    return this.board(scope, p, bay.branchId);
  }
}
