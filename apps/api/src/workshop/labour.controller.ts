import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  labourReportQuerySchema,
  manualTimeEntrySchema,
  voidTimeEntrySchema,
  type LabourReportQuery,
  type ManualTimeEntryInput,
  type VoidTimeEntryInput,
} from '@erp/validation';
import { CurrentPrincipal, CurrentScope, RequestId, RequirePermission } from '../auth/decorators';
import type { CompanyScope, Principal } from '../auth/principal';
import { ZodPipe } from '../common/zod.pipe';
import {
  CurrentClockDto,
  JobCardDto,
  LabourReportDto,
  ManualTimeEntryDto,
  VoidTimeEntryDto,
} from './job.dto';
import { LabourService } from './labour.service';

const id404 = new ParseUUIDPipe({ errorHttpStatusCode: 404 });
const ctxOf = (p: Principal, requestId?: string) => ({ actorUserId: p.userId, requestId });

/**
 * Labour time (WMS-007). Clocking needs workshop.job.read for the job's branch plus, checked by the
 * service, workshop.job.work and being the task's technician; corrections need workshop.job.manage.
 * The report needs workshop.job.manage (branch scope).
 */
@ApiTags('workshop')
@ApiBearerAuth()
@ApiParam({ name: 'companyId', format: 'uuid' })
@Controller({ path: 'companies/:companyId' })
export class LabourController {
  constructor(private readonly labour: LabourService) {}

  @Post('jobs/:jobId/tasks/:taskId/clock-on')
  @HttpCode(200)
  @RequirePermission('workshop.job.read')
  @ApiParam({ name: 'jobId', format: 'uuid' })
  @ApiParam({ name: 'taskId', format: 'uuid' })
  @ApiOperation({ operationId: 'clockOnTask', summary: 'The assigned technician starts timing a task' })
  @ApiOkResponse({ type: JobCardDto })
  clockOn(
    @CurrentScope() scope: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('jobId', id404) jobId: string,
    @Param('taskId', id404) taskId: string,
    @RequestId() rid?: string,
  ): Promise<JobCardDto> {
    return this.labour.clockOn(scope, p, jobId, taskId, ctxOf(p, rid));
  }

  @Post('time-entries/:entryId/clock-off')
  @HttpCode(200)
  @RequirePermission('workshop.job.read')
  @ApiParam({ name: 'entryId', format: 'uuid' })
  @ApiOperation({
    operationId: 'clockOffTimeEntry',
    summary: 'Stop an open entry (the technician, or a manager for a forgotten timer)',
  })
  @ApiOkResponse({ type: JobCardDto })
  clockOff(
    @CurrentScope() scope: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('entryId', id404) entryId: string,
    @RequestId() rid?: string,
  ): Promise<JobCardDto> {
    return this.labour.stop(scope, p, entryId, ctxOf(p, rid));
  }

  @Post('jobs/:jobId/time-entries')
  @RequirePermission('workshop.job.read')
  @ApiParam({ name: 'jobId', format: 'uuid' })
  @ApiOperation({
    operationId: 'addManualTimeEntry',
    summary: 'A manager enters time a technician did not clock (with a reason; not their own)',
  })
  @ApiBody({ type: ManualTimeEntryDto })
  @ApiCreatedResponse({ type: JobCardDto })
  addManual(
    @CurrentScope() scope: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('jobId', id404) jobId: string,
    @Body(new ZodPipe(manualTimeEntrySchema)) body: ManualTimeEntryInput,
    @RequestId() rid?: string,
  ): Promise<JobCardDto> {
    return this.labour.addManual(scope, p, jobId, body, ctxOf(p, rid));
  }

  @Post('time-entries/:entryId/void')
  @HttpCode(200)
  @RequirePermission('workshop.job.read')
  @ApiParam({ name: 'entryId', format: 'uuid' })
  @ApiOperation({ operationId: 'voidTimeEntry', summary: 'A manager voids a wrong entry with a reason' })
  @ApiBody({ type: VoidTimeEntryDto })
  @ApiOkResponse({ type: JobCardDto })
  void(
    @CurrentScope() scope: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('entryId', id404) entryId: string,
    @Body(new ZodPipe(voidTimeEntrySchema)) body: VoidTimeEntryInput,
    @RequestId() rid?: string,
  ): Promise<JobCardDto> {
    return this.labour.void(scope, p, entryId, body, ctxOf(p, rid));
  }

  @Get('time-entries/current')
  @RequirePermission('workshop.job.read')
  @ApiOperation({ operationId: 'getMyClock', summary: 'The task the caller is clocked on to' })
  @ApiOkResponse({ type: CurrentClockDto })
  current(@CurrentScope() scope: CompanyScope, @CurrentPrincipal() p: Principal): Promise<CurrentClockDto> {
    return this.labour.current(scope, p);
  }

  @Get('labour-time')
  @RequirePermission('workshop.job.manage')
  @ApiOperation({
    operationId: 'getLabourReport',
    summary: 'Clocked hours, estimate against actual and efficiency per technician',
  })
  @ApiQuery({ name: 'from', example: '2026-11-01', description: 'Local date (company time zone)' })
  @ApiQuery({ name: 'to', example: '2026-11-30' })
  @ApiQuery({ name: 'branchId', required: false })
  @ApiOkResponse({ type: LabourReportDto })
  report(
    @CurrentScope() scope: CompanyScope,
    @Query(new ZodPipe(labourReportQuerySchema)) q: LabourReportQuery,
  ): Promise<LabourReportDto> {
    return this.labour.report(scope, q);
  }
}
