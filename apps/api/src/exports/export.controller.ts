import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Res } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { createExportSchema, type CreateExportInput } from '@erp/validation';
import type { Response } from 'express';
import { CurrentPrincipal, RequestId } from '../auth/decorators';
import type { Principal } from '../auth/principal';
import { ZodPipe } from '../common/zod.pipe';
import { CreateExportDto, ExportJobDto } from './export.dto';
import { ExportQueue } from './export.queue';
import { ExportService } from './export.service';

const companyIdPipe = new ParseUUIDPipe({ errorHttpStatusCode: 404 });

/**
 * Export centre. Any member may call these; the export kind's own permission is checked when the
 * export is requested, produced and downloaded. People only ever see their own exports.
 */
@ApiTags('exports')
@ApiBearerAuth()
@ApiParam({ name: 'companyId', format: 'uuid' })
@Controller({ path: 'companies/:companyId/exports' })
export class ExportController {
  constructor(
    private readonly exports: ExportService,
    private readonly queue: ExportQueue,
  ) {}

  @Post()
  @HttpCode(202)
  @ApiOperation({ operationId: 'requestExport', summary: 'Queue a report file (CSV or Excel)' })
  @ApiBody({ type: CreateExportDto })
  @ApiAcceptedResponse({ type: ExportJobDto })
  async request(
    @CurrentPrincipal() p: Principal,
    @Param('companyId', companyIdPipe) companyId: string,
    @Body(new ZodPipe(createExportSchema)) body: CreateExportInput,
    @RequestId() requestId?: string,
  ): Promise<ExportJobDto> {
    const job = await this.exports.request(companyId, p, body, { actorUserId: p.userId, requestId });
    await this.queue.enqueue(job.id);
    return job;
  }

  @Get()
  @ApiOperation({
    operationId: 'listMyExports',
    summary: 'The caller’s exports in this company, newest first (50)',
  })
  @ApiOkResponse({ type: [ExportJobDto] })
  list(
    @CurrentPrincipal() p: Principal,
    @Param('companyId', companyIdPipe) companyId: string,
  ): Promise<ExportJobDto[]> {
    return this.exports.listMine(companyId, p);
  }

  @Get(':exportId')
  @ApiParam({ name: 'exportId', format: 'uuid' })
  @ApiOperation({ operationId: 'getMyExport' })
  @ApiOkResponse({ type: ExportJobDto })
  get(
    @CurrentPrincipal() p: Principal,
    @Param('companyId', companyIdPipe) companyId: string,
    @Param('exportId', new ParseUUIDPipe({ errorHttpStatusCode: 404 })) id: string,
  ): Promise<ExportJobDto> {
    return this.exports.getMine(companyId, p, id);
  }

  @Get(':exportId/download')
  @ApiParam({ name: 'exportId', format: 'uuid' })
  @ApiOperation({
    operationId: 'downloadExport',
    summary: 'The file (requester only; permission re-checked; audited). 410 when expired',
  })
  @ApiProduces('text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @ApiOkResponse({ description: 'The file', schema: { type: 'string', format: 'binary' } })
  async download(
    @CurrentPrincipal() p: Principal,
    @Param('companyId', companyIdPipe) companyId: string,
    @Param('exportId', new ParseUUIDPipe({ errorHttpStatusCode: 404 })) id: string,
    @Res() res: Response,
    @RequestId() requestId?: string,
  ): Promise<void> {
    const file = await this.exports.download(companyId, p, id, { actorUserId: p.userId, requestId });
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    res.setHeader('Content-Length', String(file.content.length));
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(file.content);
  }
}
