import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import {
  addJobPartSchema,
  jobPartStepSchema,
  type AddJobPartInput,
  type JobPartStepInput,
} from '@erp/validation';
import { CurrentPrincipal, CurrentScope, RequestId, RequirePermission } from '../auth/decorators';
import type { CompanyScope, Principal } from '../auth/principal';
import { ZodPipe } from '../common/zod.pipe';
import { AddJobPartDto, JobPartsDto, JobPartStepDto } from './job-part.dto';
import { JobPartService } from './job-part.service';

const id404 = new ParseUUIDPipe({ errorHttpStatusCode: 404 });
const ctxOf = (p: Principal, requestId?: string) => ({ actorUserId: p.userId, requestId });

/** Parts on jobs (T-75). Viewing: workshop.job.read; acting: workshop.job.manage or inventory.manage. */
@ApiTags('workshop')
@ApiBearerAuth()
@ApiParam({ name: 'companyId', format: 'uuid' })
@Controller({ path: 'companies/:companyId' })
export class JobPartController {
  constructor(private readonly parts: JobPartService) {}

  @Get('jobs/:jobId/parts')
  @RequirePermission('workshop.job.read')
  @ApiParam({ name: 'jobId', format: 'uuid' })
  @ApiOperation({ operationId: 'getJobParts' })
  @ApiOkResponse({ type: JobPartsDto })
  list(
    @CurrentScope() s: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('jobId', id404) jobId: string,
  ) {
    return this.parts.list(s, p, jobId);
  }

  @Post('jobs/:jobId/parts')
  @RequirePermission('workshop.job.read')
  @ApiParam({ name: 'jobId', format: 'uuid' })
  @ApiOperation({
    operationId: 'reserveJobPart',
    summary: 'Reserve a part from the branch stock for the job',
  })
  @ApiBody({ type: AddJobPartDto })
  @ApiCreatedResponse({ type: JobPartsDto })
  add(
    @CurrentScope() s: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('jobId', id404) jobId: string,
    @Body(new ZodPipe(addJobPartSchema)) b: AddJobPartInput,
    @RequestId() rid?: string,
  ) {
    return this.parts.add(s, p, jobId, b, ctxOf(p, rid));
  }

  @Post('job-parts/:jobPartId/release')
  @HttpCode(200)
  @RequirePermission('workshop.job.read')
  @ApiParam({ name: 'jobPartId', format: 'uuid' })
  @ApiOperation({ operationId: 'releaseJobPart', summary: 'Give a reservation back to stock' })
  @ApiOkResponse({ type: JobPartsDto })
  release(
    @CurrentScope() s: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('jobPartId', id404) id: string,
    @RequestId() rid?: string,
  ) {
    return this.parts.release(s, p, id, ctxOf(p, rid));
  }

  @Post('job-parts/:jobPartId/issue')
  @HttpCode(200)
  @RequirePermission('workshop.job.read')
  @ApiParam({ name: 'jobPartId', format: 'uuid' })
  @ApiOperation({
    operationId: 'issueJobPart',
    summary: 'Take the reserved part out of stock for the job (Dr cost of parts sold, Cr inventory)',
  })
  @ApiBody({ type: JobPartStepDto })
  @ApiOkResponse({ type: JobPartsDto })
  issue(
    @CurrentScope() s: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('jobPartId', id404) id: string,
    @Body(new ZodPipe(jobPartStepSchema)) b: JobPartStepInput,
    @RequestId() rid?: string,
  ) {
    return this.parts.issue(s, p, id, b, ctxOf(p, rid));
  }

  @Post('job-parts/:jobPartId/return')
  @HttpCode(200)
  @RequirePermission('workshop.job.read')
  @ApiParam({ name: 'jobPartId', format: 'uuid' })
  @ApiOperation({
    operationId: 'returnJobPart',
    summary: 'Put an issued part back into stock at its issue cost',
  })
  @ApiBody({ type: JobPartStepDto })
  @ApiOkResponse({ type: JobPartsDto })
  returnToStock(
    @CurrentScope() s: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('jobPartId', id404) id: string,
    @Body(new ZodPipe(jobPartStepSchema)) b: JobPartStepInput,
    @RequestId() rid?: string,
  ) {
    return this.parts.returnToStock(s, p, id, b, ctxOf(p, rid));
  }
}
