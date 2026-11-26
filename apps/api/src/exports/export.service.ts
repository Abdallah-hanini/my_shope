import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma, type ExportJob } from '@prisma/client';
import { createTranslator } from '@erp/localization';
import { createExportSchema, EXPORT_PERMISSION, type CreateExportInput } from '@erp/validation';
import type { CompanyScope, Principal } from '../auth/principal';
import { AuthzService } from '../authz/authz.service';
import { resolveScope } from '../authz/scope';
import { DomainError, forbidden, notFound, unprocessable } from '../common/errors';
import { API_ENV, type ApiEnv } from '../config/env';
import { PrismaService } from '../infra/prisma.service';
import { ledgerBranchFilter } from '../reporting/report-scope';
import { writeAudit, type AuditContext } from '../platform/audit';
import { ExportBuilders } from './builders';
import { toCsv } from './csv';
import type { ExportJobDto } from './export.dto';
import { toXlsx } from './xlsx';

/** At most this many waiting or running exports per person (protects the shop server). */
export const MAX_ACTIVE_EXPORTS = 3;
/** A job running longer than this is considered interrupted (process restart) and marked failed. */
const STUCK_AFTER_MS = 10 * 60_000;

const CONTENT_TYPE = {
  csv: 'text/csv; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
} as const;

export function toJobDto(j: Omit<ExportJob, 'content'>): ExportJobDto {
  return {
    id: j.id,
    kind: j.kind,
    format: j.format,
    locale: j.locale,
    params: j.params as Record<string, unknown>,
    status: j.status,
    error: j.error,
    rowCount: j.rowCount,
    fileName: j.fileName,
    sizeBytes: j.sizeBytes,
    createdAt: j.createdAt.toISOString(),
    finishedAt: j.finishedAt?.toISOString() ?? null,
    expiresAt: j.expiresAt?.toISOString() ?? null,
  };
}

/** Columns without the file itself, for lists. */
const META = Object.fromEntries(
  Object.keys(Prisma.ExportJobScalarFieldEnum)
    .filter((k) => k !== 'content')
    .map((k) => [k, true]),
) as Prisma.ExportJobSelect;

/**
 * WEB-205 export centre. PostgreSQL holds the job state and the file; the queue only carries the
 * job id, so a lost or replayed message can never produce a second file or a wrong status.
 */
@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthzService,
    private readonly builders: ExportBuilders,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  /** Current scope of `userId` for the export kind, or null when the permission is gone. */
  private async scopeFor(userId: string, companyId: string, kind: string): Promise<CompanyScope | null> {
    const permission = EXPORT_PERMISSION[kind as CreateExportInput['kind']];
    if (!permission) return null;
    return resolveScope(companyId, permission, await this.authz.grants(userId, companyId));
  }

  async request(
    companyId: string,
    p: Principal,
    input: CreateExportInput,
    ctx: AuditContext,
  ): Promise<ExportJobDto> {
    const grants = await this.authz.grants(p.userId, companyId);
    if (grants.length === 0) throw notFound('Company');
    const scope = resolveScope(companyId, EXPORT_PERMISSION[input.kind], grants);
    if (!scope) throw forbidden(`Missing permission ${EXPORT_PERMISSION[input.kind]}`);
    // Fail fast on parameters the report itself would refuse.
    await ledgerBranchFilter(this.prisma, scope, input.params.branchId);
    if (input.kind === 'general_ledger') {
      const account = await this.prisma.account.findUnique({
        where: { companyId_id: { companyId, id: input.params.accountId } },
      });
      if (!account) throw unprocessable('accountId is not an account of this company');
      if (!account.isPosting)
        throw unprocessable('This is a header account; choose one of its posting accounts');
    }
    const job = await this.prisma.$transaction(async (tx) => {
      // Serialise this person's requests so the active-export limit cannot be raced.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`export:${p.userId}`}))`;
      const active = await tx.exportJob.count({
        where: { requestedBy: p.userId, status: { in: ['queued', 'running'] } },
      });
      if (active >= MAX_ACTIVE_EXPORTS) {
        throw new DomainError(
          HttpStatus.TOO_MANY_REQUESTS,
          `You already have ${active} exports in progress; wait until one is ready`,
        );
      }
      const created = await tx.exportJob.create({
        data: {
          companyId,
          requestedBy: p.userId,
          kind: input.kind,
          format: input.format,
          locale: input.locale,
          params: input.params as Prisma.InputJsonValue,
        },
        select: META,
      });
      await writeAudit(tx, ctx, {
        action: 'export.request',
        entityType: 'export_job',
        entityId: created.id,
        companyId,
        branchId: input.params.branchId ?? null,
        after: { kind: input.kind, format: input.format, params: input.params },
      });
      return created;
    });
    return toJobDto(job);
  }

  async listMine(companyId: string, p: Principal): Promise<ExportJobDto[]> {
    const grants = await this.authz.grants(p.userId, companyId);
    if (grants.length === 0) throw notFound('Company');
    const rows = await this.prisma.exportJob.findMany({
      where: { companyId, requestedBy: p.userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: META,
    });
    return rows.map(toJobDto);
  }

  async getMine(companyId: string, p: Principal, id: string): Promise<ExportJobDto> {
    // Someone else's export is indistinguishable from a missing one.
    const job = await this.prisma.exportJob.findFirst({
      where: { id, companyId, requestedBy: p.userId },
      select: META,
    });
    if (!job) throw notFound('Export');
    return toJobDto(job);
  }

  /**
   * The file, for its requester only, re-checking now that they still hold the report permission
   * over every branch the file covers. Each download is audited.
   */
  async download(
    companyId: string,
    p: Principal,
    id: string,
    ctx: AuditContext,
  ): Promise<{ fileName: string; contentType: string; content: Buffer }> {
    const job = await this.prisma.exportJob.findFirst({ where: { id, companyId, requestedBy: p.userId } });
    if (!job) throw notFound('Export');
    if (job.status === 'expired' || (job.expiresAt && job.expiresAt <= new Date())) {
      throw new DomainError(HttpStatus.GONE, 'This export has expired; request it again');
    }
    if (job.status !== 'succeeded' || !job.content) {
      throw new DomainError(HttpStatus.CONFLICT, `This export is ${job.status}, not ready to download`);
    }
    const now = await this.scopeFor(p.userId, companyId, job.kind);
    const branchId = (job.params as { branchId?: string }).branchId;
    const covered =
      now !== null &&
      (now.allBranches ||
        (branchId
          ? now.branchIds.includes(branchId)
          : !job.scopeAllBranches && job.scopeBranchIds.every((b) => now.branchIds.includes(b))));
    if (!covered) throw forbidden('Your role no longer allows this report for the branches in this file');
    await this.prisma.$transaction((tx) =>
      writeAudit(tx, ctx, {
        action: 'export.download',
        entityType: 'export_job',
        entityId: job.id,
        companyId,
        branchId: branchId ?? null,
        after: { kind: job.kind, format: job.format, fileName: job.fileName, sizeBytes: job.sizeBytes },
      }),
    );
    return { fileName: job.fileName!, contentType: job.contentType!, content: Buffer.from(job.content) };
  }

  /**
   * Produces the file for one job. Safe to call any number of times: only a call that moves the
   * job from "queued" to "running" does the work (queue replay is a no-op).
   */
  async process(id: string): Promise<'done' | 'skipped'> {
    const claimed = await this.prisma.exportJob.updateMany({
      where: { id, status: 'queued' },
      data: { status: 'running', startedAt: new Date(), attempts: { increment: 1 } },
    });
    if (claimed.count === 0) return 'skipped';
    const job = await this.prisma.exportJob.findUniqueOrThrow({
      where: { id },
      include: { company: true, requester: true },
    });
    try {
      // The requester's scope now, not at request time: a removed permission stops the export.
      const scope = await this.scopeFor(job.requestedBy, job.companyId, job.kind);
      if (!scope) throw forbidden('Your role no longer allows this report');
      const input = createExportSchema.parse({
        kind: job.kind,
        format: job.format,
        locale: job.locale,
        params: job.params,
      });
      const locale = input.locale;
      const table = await this.builders.build(input, {
        company: job.company,
        scope,
        locale,
        requesterName: job.requester.displayName,
      });
      const t = createTranslator(locale);
      const content = input.format === 'csv' ? toCsv(table) : await toXlsx(table, t('export.meta.about'));
      if (content.length > this.env.EXPORT_MAX_BYTES) {
        throw unprocessable('The file is too large to keep; narrow the date range or choose a branch');
      }
      const p = input.params;
      const fileName = `${input.kind.replace('_', '-')}_${job.company.code}_${p.from}_${p.to}.${input.format}`;
      const finishedAt = new Date();
      await this.prisma.exportJob.update({
        where: { id },
        data: {
          status: 'succeeded',
          content: new Uint8Array(content),
          sizeBytes: content.length,
          rowCount: table.rows.length,
          fileName,
          contentType: CONTENT_TYPE[input.format],
          scopeAllBranches: scope.allBranches,
          scopeBranchIds: scope.branchIds,
          finishedAt,
          expiresAt: new Date(finishedAt.getTime() + this.env.EXPORT_RETENTION_DAYS * 86_400_000),
        },
      });
      return 'done';
    } catch (err) {
      const message =
        err instanceof DomainError
          ? String((err.getResponse() as { message?: string }).message ?? err.message)
          : 'The export failed unexpectedly; it has been logged. Try again or contact support.';
      if (!(err instanceof DomainError))
        this.logger.error(`export ${id} failed: ${err instanceof Error ? err.stack : String(err)}`);
      await this.prisma.exportJob.update({
        where: { id },
        data: { status: 'failed', error: message, finishedAt: new Date() },
      });
      return 'done';
    }
  }

  /**
   * Housekeeping (run every minute): deletes files past retention, fails jobs interrupted by a
   * restart, and returns waiting job ids so the caller re-enqueues any the queue lost.
   */
  async sweep(): Promise<{ expired: number; interrupted: number; waiting: string[] }> {
    const expired = await this.prisma.exportJob.updateMany({
      where: { status: 'succeeded', expiresAt: { lte: new Date() } },
      data: { status: 'expired', content: null },
    });
    const interrupted = await this.prisma.exportJob.updateMany({
      where: { status: 'running', startedAt: { lt: new Date(Date.now() - STUCK_AFTER_MS) } },
      data: {
        status: 'failed',
        error: 'The export was interrupted (server restart); request it again',
        finishedAt: new Date(),
      },
    });
    const waiting = await this.prisma.exportJob.findMany({
      where: { status: 'queued', createdAt: { lt: new Date(Date.now() - 30_000) } },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    return { expired: expired.count, interrupted: interrupted.count, waiting: waiting.map((w) => w.id) };
  }
}
