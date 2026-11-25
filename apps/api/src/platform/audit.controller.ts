import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiQuery,
  ApiTags,
  ApiParam,
} from '@nestjs/swagger';
import { listQuerySchema, type ListQuery } from '@erp/validation';
import { CurrentScope, RequirePermission } from '../auth/decorators';
import type { CompanyScope } from '../auth/principal';
import { decodeCursor, encodeCursor } from '../common/cursor';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../infra/prisma.service';

export class AuditEventDto {
  @ApiProperty() id!: string;
  @ApiProperty({ format: 'date-time' }) occurredAt!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) actorUserId!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) branchId!: string | null;
  @ApiProperty() action!: string;
  @ApiProperty() entityType!: string;
  @ApiProperty() entityId!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) reason!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) requestId!: string | null;
  @ApiPropertyOptional({ type: 'object', additionalProperties: true, nullable: true }) before!: unknown;
  @ApiPropertyOptional({ type: 'object', additionalProperties: true, nullable: true }) after!: unknown;
}

export class AuditEventPageDto {
  @ApiProperty({ type: [AuditEventDto] }) items!: AuditEventDto[];
  @ApiPropertyOptional({ nullable: true, type: String }) nextCursor!: string | null;
}

@ApiTags('audit')
@ApiBearerAuth()
@ApiParam({ name: 'companyId', format: 'uuid' })
@Controller({ path: 'companies/:companyId/audit-events' })
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermission('audit.read')
  @ApiOperation({ operationId: 'listAuditEvents', summary: 'Audit trail of the company, newest first' })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkResponse({ type: AuditEventPageDto })
  async list(
    @CurrentScope() scope: CompanyScope,
    @Query(new ZodPipe(listQuerySchema)) q: ListQuery,
  ): Promise<AuditEventPageDto> {
    const cursor = decodeCursor(q.cursor);
    const rows = await this.prisma.auditEvent.findMany({
      where: {
        companyId: scope.companyId,
        // Branch-limited auditors see only events of their branches.
        ...(scope.allBranches ? {} : { branchId: { in: scope.branchIds } }),
        ...(cursor
          ? {
              OR: [
                { occurredAt: { lt: new Date(cursor.at) } },
                { occurredAt: new Date(cursor.at), id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
    });
    const page = rows.slice(0, q.limit);
    const last = page[page.length - 1];
    return {
      items: page.map((r) => ({
        id: r.id,
        occurredAt: r.occurredAt.toISOString(),
        actorUserId: r.actorUserId,
        branchId: r.branchId,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        reason: r.reason,
        requestId: r.requestId,
        before: r.before,
        after: r.after,
      })),
      nextCursor:
        rows.length > q.limit && last
          ? encodeCursor({ at: last.occurredAt.toISOString(), id: last.id })
          : null,
    };
  }
}
