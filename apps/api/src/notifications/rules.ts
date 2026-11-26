import type { OutboxEvent, Prisma } from '@prisma/client';
import { resolveScope, type AssignmentGrant } from '../authz/scope';

/** What one event tells one person. Rendered by clients from `kind` + `params` (no amounts). */
export interface NotificationDraft {
  userId: string;
  kind:
    | 'journal_reversed'
    | 'role_granted'
    | 'role_revoked'
    | 'role_changed'
    | 'period_closed'
    | 'export_ready'
    | 'export_failed'
    | 'job_assigned'
    | 'job_rework'
    | 'job_ready'
    | 'job_addition_proposed'
    | 'job_addition_approved'
    | 'job_addition_declined';
  params: Record<string, string | null>;
  /** Path inside the company area (checked by the database), or null. */
  link: string | null;
}

type Tx = Prisma.TransactionClient;
type Rule = (tx: Tx, e: OutboxEvent & { companyId: string }) => Promise<NotificationDraft[]>;

async function grantsOf(tx: Tx, userId: string, companyId: string): Promise<AssignmentGrant[]> {
  const rows = await tx.roleAssignment.findMany({
    where: { userId, companyId, user: { status: 'active' } },
    select: { branchId: true, role: { select: { permissions: true } } },
  });
  return rows.map((r) => ({ branchId: r.branchId, permissions: r.role.permissions }));
}

/** Whether `userId` may currently see a record of `branchId` (null = company level) under `permission`. */
async function canSee(
  tx: Tx,
  userId: string,
  companyId: string,
  permission: string,
  branchId: string | null,
) {
  const s = resolveScope(companyId, permission, await grantsOf(tx, userId, companyId));
  return !!s && (s.allBranches || (branchId !== null && s.branchIds.includes(branchId)));
}

async function actorName(tx: Tx, actorUserId: string | null): Promise<string | null> {
  if (!actorUserId) return null;
  return (
    (await tx.user.findUnique({ where: { id: actorUserId }, select: { displayName: true } }))?.displayName ??
    null
  );
}

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

/**
 * Notification rules by outbox event type. Nobody is notified of their own action, and a message
 * is only created for someone who may see the record it refers to. Event types without a rule are
 * delivered to no one.
 */
export const RULES: Record<string, Rule> = {
  'accounting.journal.reversed': async (tx, e) => {
    const p = e.payload as { journalId?: string; reversalOfId?: string };
    if (!p.journalId || !p.reversalOfId) throw new Error('journal reversal event without journal ids');
    const [reversal, original] = await Promise.all([
      tx.journal.findUniqueOrThrow({ where: { id: p.journalId }, select: { number: true, postedBy: true } }),
      tx.journal.findUniqueOrThrow({
        where: { id: p.reversalOfId },
        select: { number: true, postedBy: true, branchId: true },
      }),
    ]);
    const actor = e.actorUserId ?? reversal.postedBy;
    if (original.postedBy === actor) return [];
    if (!(await canSee(tx, original.postedBy, e.companyId, 'accounting.journal.read', original.branchId)))
      return [];
    return [
      {
        userId: original.postedBy,
        kind: 'journal_reversed',
        params: {
          number: original.number,
          reversalNumber: reversal.number,
          actor: await actorName(tx, actor),
        },
        link: `journals/${p.journalId}`,
      },
    ];
  },

  'iam.assignment.created': async (tx, e) => roleAssignmentNotice(tx, e, 'role_granted'),
  'iam.assignment.revoked': async (tx, e) => roleAssignmentNotice(tx, e, 'role_revoked'),

  'iam.role.updated': async (tx, e) => {
    const roleId = str((e.payload as { roleId?: unknown }).roleId);
    if (!roleId) throw new Error('role event without roleId');
    const role = await tx.role.findUnique({ where: { id: roleId }, select: { name: true, nameAr: true } });
    if (!role) return []; // deleted since: nothing left to tell
    const holders = await tx.roleAssignment.findMany({
      where: { roleId, companyId: e.companyId, user: { status: 'active' } },
      select: { userId: true },
      distinct: ['userId'],
    });
    const actor = await actorName(tx, e.actorUserId);
    return holders
      .filter((h) => h.userId !== e.actorUserId)
      .map((h) => ({
        userId: h.userId,
        kind: 'role_changed' as const,
        params: { role: role.name, roleAr: role.nameAr, actor },
        link: null,
      }));
  },

  'accounting.period.closed': async (tx, e) => {
    const name = str((e.payload as { name?: unknown }).name);
    // People who post journals need to know a period no longer accepts postings.
    const rows = await tx.roleAssignment.findMany({
      where: {
        companyId: e.companyId,
        role: { permissions: { has: 'accounting.journal.post' } },
        user: { status: 'active' },
      },
      select: { userId: true },
      distinct: ['userId'],
    });
    const actor = await actorName(tx, e.actorUserId);
    const out: NotificationDraft[] = [];
    for (const { userId } of rows) {
      if (userId === e.actorUserId) continue;
      const canOpen = await canSee(tx, userId, e.companyId, 'accounting.period.read', null);
      out.push({
        userId,
        kind: 'period_closed',
        params: { period: name, actor },
        link: canOpen ? 'periods' : null,
      });
    }
    return out;
  },

  'export.completed': async (tx, e) => {
    const p = e.payload as {
      exportId?: string;
      kind?: string;
      status?: string;
      fileName?: string;
      error?: string;
    };
    if (!p.exportId) throw new Error('export event without exportId');
    const job = await tx.exportJob.findUnique({ where: { id: p.exportId }, select: { requestedBy: true } });
    if (!job) return [];
    return [
      {
        userId: job.requestedBy,
        kind: p.status === 'succeeded' ? 'export_ready' : 'export_failed',
        params: { exportKind: str(p.kind), fileName: str(p.fileName), error: str(p.error) },
        link: 'exports',
      },
    ];
  },

  'workshop.task.assigned': async (tx, e) => {
    const p = e.payload as { jobId?: string; taskId?: string; technicianId?: string };
    if (!p.jobId || !p.taskId || !p.technicianId)
      throw new Error('assignment event without job, task or technician');
    if (p.technicianId === e.actorUserId) return [];
    const job = await jobSummary(tx, p.jobId);
    const task = await tx.jobTask.findUnique({ where: { id: p.taskId }, select: { description: true } });
    if (!(await canSee(tx, p.technicianId, e.companyId, 'workshop.job.read', job.branchId))) return [];
    return [
      {
        userId: p.technicianId,
        kind: 'job_assigned',
        params: {
          number: job.number,
          plate: job.plate,
          task: task?.description ?? null,
          actor: await actorName(tx, e.actorUserId),
        },
        link: `jobs/${p.jobId}`,
      },
    ];
  },

  'workshop.job.rework': async (tx, e) => {
    const p = e.payload as { jobId?: string; technicianIds?: string[] };
    if (!p.jobId) throw new Error('rework event without jobId');
    const job = await jobSummary(tx, p.jobId);
    const out: NotificationDraft[] = [];
    for (const userId of p.technicianIds ?? []) {
      if (
        userId === e.actorUserId ||
        !(await canSee(tx, userId, e.companyId, 'workshop.job.read', job.branchId))
      )
        continue;
      out.push({
        userId,
        kind: 'job_rework',
        params: { number: job.number, plate: job.plate },
        link: `jobs/${p.jobId}`,
      });
    }
    return out;
  },

  'workshop.job.addition_proposed': additionProposed,

  'workshop.job.addition_decided': async (tx, e) => {
    const p = e.payload as { jobId?: string; decision?: string; proposedBy?: string };
    if (!p.jobId || !p.proposedBy || !p.decision) throw new Error('decision event without job or proposer');
    if (p.proposedBy === e.actorUserId) return [];
    const job = await jobSummary(tx, p.jobId);
    if (!(await canSee(tx, p.proposedBy, e.companyId, 'workshop.job.read', job.branchId))) return [];
    return [
      {
        userId: p.proposedBy,
        kind: p.decision === 'approve' ? 'job_addition_approved' : 'job_addition_declined',
        params: { number: job.number, plate: job.plate },
        link: `jobs/${p.jobId}`,
      },
    ];
  },

  'workshop.job.ready': async (tx, e) => {
    const p = e.payload as { jobId?: string };
    if (!p.jobId) throw new Error('ready event without jobId');
    const job = await jobSummary(tx, p.jobId);
    // The person who opened the job (the service advisor) calls the customer.
    if (
      job.createdBy === e.actorUserId ||
      !(await canSee(tx, job.createdBy, e.companyId, 'workshop.job.read', job.branchId))
    )
      return [];
    return [
      {
        userId: job.createdBy,
        kind: 'job_ready',
        params: { number: job.number, plate: job.plate },
        link: `jobs/${p.jobId}`,
      },
    ];
  },
};

/** Managers of the job's branch hear of additional work waiting for the customer's decision. */
async function additionProposed(
  tx: Tx,
  e: OutboxEvent & { companyId: string },
): Promise<NotificationDraft[]> {
  const p = e.payload as { jobId?: string; additionId?: string };
  if (!p.jobId || !p.additionId) throw new Error('addition event without job or addition');
  const job = await jobSummary(tx, p.jobId);
  const a = await tx.jobAddition.findUniqueOrThrow({
    where: { id: p.additionId },
    select: { finding: true },
  });
  const rows = await tx.roleAssignment.findMany({
    where: {
      companyId: e.companyId,
      OR: [{ branchId: null }, { branchId: job.branchId }],
      role: { permissions: { has: 'workshop.job.manage' } },
      user: { status: 'active' },
    },
    select: { userId: true },
    distinct: ['userId'],
  });
  const actor = await actorName(tx, e.actorUserId);
  const out: NotificationDraft[] = [];
  for (const { userId } of rows) {
    if (userId === e.actorUserId) continue;
    if (!(await canSee(tx, userId, e.companyId, 'workshop.job.manage', job.branchId))) continue;
    out.push({
      userId,
      kind: 'job_addition_proposed',
      params: { number: job.number, plate: job.plate, finding: a.finding, actor },
      link: `jobs/${p.jobId}`,
    });
  }
  return out;
}

async function jobSummary(tx: Tx, jobId: string) {
  const j = await tx.jobCard.findUniqueOrThrow({
    where: { id: jobId },
    select: { number: true, branchId: true, createdBy: true, vehicle: { select: { plate: true } } },
  });
  return { number: j.number, branchId: j.branchId, createdBy: j.createdBy, plate: j.vehicle.plate };
}

async function roleAssignmentNotice(
  tx: Tx,
  e: OutboxEvent & { companyId: string },
  kind: 'role_granted' | 'role_revoked',
): Promise<NotificationDraft[]> {
  const p = e.payload as { userId?: string; roleId?: string; branchId?: string | null };
  if (!p.userId || !p.roleId) throw new Error('assignment event without user or role');
  if (p.userId === e.actorUserId) return [];
  const user = await tx.user.findUnique({ where: { id: p.userId }, select: { status: true } });
  if (!user || user.status !== 'active') return [];
  const [role, branch] = await Promise.all([
    tx.role.findUnique({ where: { id: p.roleId }, select: { name: true, nameAr: true } }),
    p.branchId ? tx.branch.findUnique({ where: { id: p.branchId }, select: { code: true } }) : null,
  ]);
  return [
    {
      userId: p.userId,
      kind,
      params: {
        role: role?.name ?? null,
        roleAr: role?.nameAr ?? null,
        branch: branch?.code ?? null,
        actor: await actorName(tx, e.actorUserId),
      },
      link: null,
    },
  ];
}
