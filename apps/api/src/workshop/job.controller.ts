import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiProduces,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  assignTaskSchema,
  authorizeJobSchema,
  cancelJobSchema,
  createJobSchema,
  decideAdditionSchema,
  proposeAdditionSchema,
  withdrawAdditionSchema,
  type DecideAdditionInput,
  type ProposeAdditionInput,
  type WithdrawAdditionInput,
  deliverJobSchema,
  jobListQuerySchema,
  jobNoteSchema,
  jobVersionSchema,
  PHOTO_LIMITS,
  photoMetaSchema,
  recordInspectionSchema,
  promiseJobSchema,
  qcResultSchema,
  updateJobDraftSchema,
  type AssignTaskInput,
  type AuthorizeJobInput,
  type CancelJobInput,
  type CreateJobInput,
  type DeliverJobInput,
  type JobListQuery,
  type JobNoteInput,
  type JobVersionInput,
  type PhotoMetaInput,
  type RecordInspectionInput,
  type PromiseJobInput,
  type QcResultInput,
  type UpdateJobDraftInput,
} from '@erp/validation';
import { CurrentPrincipal, CurrentScope, RequestId, RequirePermission } from '../auth/decorators';
import type { CompanyScope, Principal } from '../auth/principal';
import { ZodPipe } from '../common/zod.pipe';
import {
  AssignTaskDto,
  AuthorizeJobDto,
  CancelJobDto,
  CreateJobDto,
  DecideAdditionDto,
  DeliverJobDto,
  ProposeAdditionDto,
  JobCardDto,
  JobListItemDto,
  JobNoteDto,
  JobVersionDto,
  PromiseJobDto,
  QcResultDto,
  RecordInspectionDto,
  TechnicianDto,
  UpdateJobDraftDto,
} from './job.dto';
import { JobService } from './job.service';

const id404 = new ParseUUIDPipe({ errorHttpStatusCode: 404 });
const ctxOf = (p: Principal, requestId?: string) => ({ actorUserId: p.userId, requestId });

/**
 * Workshop job cards. Every route needs workshop.job.read (and gives the branch scope); each
 * change also needs the permission the lifecycle requires (manage, work or qc) on the job's branch.
 */
@ApiTags('workshop')
@ApiBearerAuth()
@ApiParam({ name: 'companyId', format: 'uuid' })
@Controller({ path: 'companies/:companyId' })
export class JobController {
  constructor(private readonly jobs: JobService) {}

  @Get('jobs')
  @RequirePermission('workshop.job.read')
  @ApiOperation({
    operationId: 'listJobs',
    summary: 'Job cards in the caller’s branches; view=open (default) for the board',
  })
  @ApiQuery({
    name: 'view',
    required: false,
    enum: ['open', 'all'],
    description: 'open (default) = before delivery or cancellation',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['draft', 'approved', 'assigned', 'in_progress', 'rework', 'qc', 'ready', 'delivered', 'cancelled'],
  })
  @ApiQuery({ name: 'branchId', required: false })
  @ApiQuery({ name: 'limit', required: false, description: '1–200, default 200' })
  @ApiOkResponse({ type: [JobListItemDto] })
  list(
    @CurrentScope() scope: CompanyScope,
    @Query(new ZodPipe(jobListQuerySchema)) q: JobListQuery,
  ): Promise<JobListItemDto[]> {
    return this.jobs.list(scope, q);
  }

  @Get('vehicles/:vehicleId/jobs')
  @RequirePermission('workshop.job.read')
  @ApiParam({ name: 'vehicleId', format: 'uuid' })
  @ApiOperation({
    operationId: 'listVehicleJobs',
    summary: 'Service history of a vehicle (jobs the caller may see)',
  })
  @ApiOkResponse({ type: [JobListItemDto] })
  vehicleJobs(
    @CurrentScope() scope: CompanyScope,
    @Param('vehicleId', id404) vehicleId: string,
  ): Promise<JobListItemDto[]> {
    return this.jobs.forVehicle(scope, vehicleId);
  }

  @Post('jobs')
  @RequirePermission('workshop.job.read')
  @ApiOperation({
    operationId: 'createJob',
    summary: 'Vehicle check-in: open a job card (workshop.job.manage on the branch)',
  })
  @ApiBody({ type: CreateJobDto })
  @ApiCreatedResponse({ type: JobCardDto })
  create(
    @CurrentScope() scope: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Body(new ZodPipe(createJobSchema)) body: CreateJobInput,
    @RequestId() rid?: string,
  ): Promise<JobCardDto> {
    return this.jobs.create(scope, p, body, ctxOf(p, rid));
  }

  @Get('jobs/:jobId')
  @RequirePermission('workshop.job.read')
  @ApiParam({ name: 'jobId', format: 'uuid' })
  @ApiOperation({ operationId: 'getJob' })
  @ApiOkResponse({ type: JobCardDto })
  get(
    @CurrentScope() scope: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('jobId', id404) id: string,
  ): Promise<JobCardDto> {
    return this.jobs.get(scope, p, id);
  }

  @Get('jobs/:jobId/technicians')
  @RequirePermission('workshop.job.read')
  @ApiParam({ name: 'jobId', format: 'uuid' })
  @ApiOperation({
    operationId: 'listJobTechnicians',
    summary: 'People who may work on this job (managers only)',
  })
  @ApiOkResponse({ type: [TechnicianDto] })
  technicians(
    @CurrentScope() scope: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('jobId', id404) id: string,
  ): Promise<TechnicianDto[]> {
    return this.jobs.technicians(scope, p, id);
  }

  @Patch('jobs/:jobId')
  @RequirePermission('workshop.job.read')
  @ApiParam({ name: 'jobId', format: 'uuid' })
  @ApiOperation({ operationId: 'updateJobDraft', summary: 'Edit a draft (details and tasks)' })
  @ApiBody({ type: UpdateJobDraftDto })
  @ApiOkResponse({ type: JobCardDto })
  update(
    @CurrentScope() scope: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('jobId', id404) id: string,
    @Body(new ZodPipe(updateJobDraftSchema)) body: UpdateJobDraftInput,
    @RequestId() rid?: string,
  ): Promise<JobCardDto> {
    return this.jobs.updateDraft(scope, p, id, body, ctxOf(p, rid));
  }

  @Post('jobs/:jobId/authorize')
  @HttpCode(200)
  @RequirePermission('workshop.job.read')
  @ApiParam({ name: 'jobId', format: 'uuid' })
  @ApiOperation({
    operationId: 'authorizeJob',
    summary: 'Record the customer’s authorisation (draft → approved/assigned)',
  })
  @ApiBody({ type: AuthorizeJobDto })
  @ApiOkResponse({ type: JobCardDto })
  authorize(
    @CurrentScope() scope: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('jobId', id404) id: string,
    @Body(new ZodPipe(authorizeJobSchema)) body: AuthorizeJobInput,
    @RequestId() rid?: string,
  ): Promise<JobCardDto> {
    return this.jobs.authorize(scope, p, id, body, ctxOf(p, rid));
  }

  @Post('jobs/:jobId/additions')
  @RequirePermission('workshop.job.read')
  @ApiParam({ name: 'jobId', format: 'uuid' })
  @ApiOperation({
    operationId: 'proposeAddition',
    summary: 'Propose additional work found during the job (the customer decides)',
  })
  @ApiBody({ type: ProposeAdditionDto })
  @ApiCreatedResponse({ type: JobCardDto })
  proposeAddition(
    @CurrentScope() scope: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('jobId', id404) id: string,
    @Body(new ZodPipe(proposeAdditionSchema)) body: ProposeAdditionInput,
    @RequestId() rid?: string,
  ): Promise<JobCardDto> {
    return this.jobs.proposeAddition(scope, p, id, body, ctxOf(p, rid));
  }

  @Post('jobs/:jobId/additions/:additionId/decision')
  @HttpCode(200)
  @RequirePermission('workshop.job.read')
  @ApiParam({ name: 'jobId', format: 'uuid' })
  @ApiParam({ name: 'additionId', format: 'uuid' })
  @ApiOperation({
    operationId: 'decideAddition',
    summary: "Record the customer's approval (tasks join the job) or refusal of additional work",
  })
  @ApiBody({ type: DecideAdditionDto })
  @ApiOkResponse({ type: JobCardDto })
  decideAddition(
    @CurrentScope() scope: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('jobId', id404) id: string,
    @Param('additionId', id404) additionId: string,
    @Body(new ZodPipe(decideAdditionSchema)) body: DecideAdditionInput,
    @RequestId() rid?: string,
  ): Promise<JobCardDto> {
    return this.jobs.decideAddition(scope, p, id, additionId, body, ctxOf(p, rid));
  }

  @Post('jobs/:jobId/additions/:additionId/withdraw')
  @HttpCode(200)
  @RequirePermission('workshop.job.read')
  @ApiParam({ name: 'jobId', format: 'uuid' })
  @ApiParam({ name: 'additionId', format: 'uuid' })
  @ApiOperation({
    operationId: 'withdrawAddition',
    summary: 'Withdraw a proposal before the customer decides',
  })
  @ApiBody({ type: CancelJobDto })
  @ApiOkResponse({ type: JobCardDto })
  withdrawAddition(
    @CurrentScope() scope: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('jobId', id404) id: string,
    @Param('additionId', id404) additionId: string,
    @Body(new ZodPipe(withdrawAdditionSchema)) body: WithdrawAdditionInput,
    @RequestId() rid?: string,
  ): Promise<JobCardDto> {
    return this.jobs.withdrawAddition(scope, p, id, additionId, body, ctxOf(p, rid));
  }

  @Post('jobs/:jobId/tasks/:taskId/assign')
  @HttpCode(200)
  @RequirePermission('workshop.job.read')
  @ApiParam({ name: 'jobId', format: 'uuid' })
  @ApiParam({ name: 'taskId', format: 'uuid' })
  @ApiOperation({ operationId: 'assignJobTask', summary: 'Set or clear the technician of a task' })
  @ApiBody({ type: AssignTaskDto })
  @ApiOkResponse({ type: JobCardDto })
  assign(
    @CurrentScope() scope: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('jobId', id404) id: string,
    @Param('taskId', id404) taskId: string,
    @Body(new ZodPipe(assignTaskSchema)) body: AssignTaskInput,
    @RequestId() rid?: string,
  ): Promise<JobCardDto> {
    return this.jobs.assignTask(scope, p, id, taskId, body, ctxOf(p, rid));
  }

  @Post('jobs/:jobId/tasks/:taskId/complete')
  @HttpCode(200)
  @RequirePermission('workshop.job.read')
  @ApiParam({ name: 'jobId', format: 'uuid' })
  @ApiParam({ name: 'taskId', format: 'uuid' })
  @ApiOperation({ operationId: 'completeJobTask', summary: 'Mark a task done (its technician or a manager)' })
  @ApiBody({ type: JobVersionDto })
  @ApiOkResponse({ type: JobCardDto })
  complete(
    @CurrentScope() scope: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('jobId', id404) id: string,
    @Param('taskId', id404) taskId: string,
    @Body(new ZodPipe(jobVersionSchema)) body: JobVersionInput,
    @RequestId() rid?: string,
  ): Promise<JobCardDto> {
    return this.jobs.completeTask(scope, p, id, taskId, body, ctxOf(p, rid));
  }

  @Post('jobs/:jobId/start')
  @HttpCode(200)
  @RequirePermission('workshop.job.read')
  @ApiParam({ name: 'jobId', format: 'uuid' })
  @ApiOperation({ operationId: 'startJob', summary: 'assigned → in progress' })
  @ApiBody({ type: JobVersionDto })
  @ApiOkResponse({ type: JobCardDto })
  start(
    @CurrentScope() scope: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('jobId', id404) id: string,
    @Body(new ZodPipe(jobVersionSchema)) body: JobVersionInput,
    @RequestId() rid?: string,
  ): Promise<JobCardDto> {
    return this.jobs.start(scope, p, id, body, ctxOf(p, rid));
  }

  @Post('jobs/:jobId/submit-qc')
  @HttpCode(200)
  @RequirePermission('workshop.job.read')
  @ApiParam({ name: 'jobId', format: 'uuid' })
  @ApiOperation({ operationId: 'submitJobForQc', summary: 'All tasks done → quality check' })
  @ApiBody({ type: JobVersionDto })
  @ApiOkResponse({ type: JobCardDto })
  submitQc(
    @CurrentScope() scope: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('jobId', id404) id: string,
    @Body(new ZodPipe(jobVersionSchema)) body: JobVersionInput,
    @RequestId() rid?: string,
  ): Promise<JobCardDto> {
    return this.jobs.submitQc(scope, p, id, body, ctxOf(p, rid));
  }

  @Post('jobs/:jobId/qc')
  @HttpCode(200)
  @RequirePermission('workshop.job.read')
  @ApiParam({ name: 'jobId', format: 'uuid' })
  @ApiOperation({
    operationId: 'recordJobQc',
    summary: 'Pass → ready; fail → rework of chosen tasks (inspector not on the job)',
  })
  @ApiBody({ type: QcResultDto })
  @ApiOkResponse({ type: JobCardDto })
  qc(
    @CurrentScope() scope: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('jobId', id404) id: string,
    @Body(new ZodPipe(qcResultSchema)) body: QcResultInput,
    @RequestId() rid?: string,
  ): Promise<JobCardDto> {
    return this.jobs.qc(scope, p, id, body, ctxOf(p, rid));
  }

  @Post('jobs/:jobId/deliver')
  @HttpCode(200)
  @RequirePermission('workshop.job.read')
  @ApiParam({ name: 'jobId', format: 'uuid' })
  @ApiOperation({ operationId: 'deliverJob', summary: 'ready → delivered (hand-over)' })
  @ApiBody({ type: DeliverJobDto })
  @ApiOkResponse({ type: JobCardDto })
  deliver(
    @CurrentScope() scope: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('jobId', id404) id: string,
    @Body(new ZodPipe(deliverJobSchema)) body: DeliverJobInput,
    @RequestId() rid?: string,
  ): Promise<JobCardDto> {
    return this.jobs.deliver(scope, p, id, body, ctxOf(p, rid));
  }

  @Post('jobs/:jobId/cancel')
  @HttpCode(200)
  @RequirePermission('workshop.job.read')
  @ApiParam({ name: 'jobId', format: 'uuid' })
  @ApiOperation({ operationId: 'cancelJob' })
  @ApiBody({ type: CancelJobDto })
  @ApiOkResponse({ type: JobCardDto })
  cancel(
    @CurrentScope() scope: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('jobId', id404) id: string,
    @Body(new ZodPipe(cancelJobSchema)) body: CancelJobInput,
    @RequestId() rid?: string,
  ): Promise<JobCardDto> {
    return this.jobs.cancel(scope, p, id, body, ctxOf(p, rid));
  }

  @Post('jobs/:jobId/promise')
  @HttpCode(200)
  @RequirePermission('workshop.job.read')
  @ApiParam({ name: 'jobId', format: 'uuid' })
  @ApiOperation({ operationId: 'setJobPromise', summary: 'Set or clear the promised time (ETA)' })
  @ApiBody({ type: PromiseJobDto })
  @ApiOkResponse({ type: JobCardDto })
  promise(
    @CurrentScope() scope: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('jobId', id404) id: string,
    @Body(new ZodPipe(promiseJobSchema)) body: PromiseJobInput,
    @RequestId() rid?: string,
  ): Promise<JobCardDto> {
    return this.jobs.promise(scope, p, id, body, ctxOf(p, rid));
  }

  @Post('jobs/:jobId/notes')
  @HttpCode(200)
  @RequirePermission('workshop.job.read')
  @ApiParam({ name: 'jobId', format: 'uuid' })
  @ApiOperation({ operationId: 'addJobNote' })
  @ApiBody({ type: JobNoteDto })
  @ApiOkResponse({ type: JobCardDto })
  note(
    @CurrentScope() scope: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('jobId', id404) id: string,
    @Body(new ZodPipe(jobNoteSchema)) body: JobNoteInput,
    @RequestId() rid?: string,
  ): Promise<JobCardDto> {
    return this.jobs.addNote(scope, p, id, body, ctxOf(p, rid));
  }

  @Post('jobs/:jobId/inspection')
  @HttpCode(200)
  @RequirePermission('workshop.job.read')
  @ApiParam({ name: 'jobId', format: 'uuid' })
  @ApiOperation({
    operationId: 'recordJobInspection',
    summary: 'Record the check-in checklist (draft; managers)',
  })
  @ApiBody({ type: RecordInspectionDto })
  @ApiOkResponse({ type: JobCardDto })
  inspect(
    @CurrentScope() scope: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('jobId', id404) id: string,
    @Body(new ZodPipe(recordInspectionSchema)) body: RecordInspectionInput,
    @RequestId() rid?: string,
  ): Promise<JobCardDto> {
    return this.jobs.recordInspection(scope, p, id, body, ctxOf(p, rid));
  }

  @Post('jobs/:jobId/photos')
  @HttpCode(200)
  @RequirePermission('workshop.job.read')
  @ApiParam({ name: 'jobId', format: 'uuid' })
  @ApiOperation({
    operationId: 'addJobPhotos',
    summary: `Upload up to ${PHOTO_LIMITS.maxPerUpload} photos (JPEG, PNG or WebP; re-encoded, metadata removed)`,
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['files', 'area'],
      properties: {
        files: { type: 'array', items: { type: 'string', format: 'binary' } },
        area: {
          type: 'string',
          enum: ['front', 'rear', 'left', 'right', 'interior', 'odometer', 'damage', 'other'],
        },
        caption: { type: 'string' },
      },
    },
  })
  @ApiOkResponse({ type: JobCardDto })
  @UseInterceptors(
    FilesInterceptor('files', PHOTO_LIMITS.maxPerUpload, {
      limits: { fileSize: PHOTO_LIMITS.maxBytes, files: PHOTO_LIMITS.maxPerUpload, fields: 5 },
    }),
  )
  addPhotos(
    @CurrentScope() scope: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('jobId', id404) id: string,
    @UploadedFiles() files: { buffer: Buffer; originalname: string }[] | undefined,
    @Body(new ZodPipe(photoMetaSchema)) body: PhotoMetaInput,
    @RequestId() rid?: string,
  ): Promise<JobCardDto> {
    return this.jobs.addPhotos(scope, p, id, files ?? [], body, ctxOf(p, rid));
  }

  @Get('jobs/:jobId/photos/:photoId')
  @RequirePermission('workshop.job.read')
  @ApiParam({ name: 'jobId', format: 'uuid' })
  @ApiParam({ name: 'photoId', format: 'uuid' })
  @ApiOperation({
    operationId: 'getJobPhoto',
    summary: 'The photo (JPEG); size=thumb for the 320 px thumbnail',
  })
  @ApiProduces('image/jpeg')
  @ApiOkResponse({ description: 'JPEG image', schema: { type: 'string', format: 'binary' } })
  async photo(
    @CurrentScope() scope: CompanyScope,
    @Param('jobId', id404) id: string,
    @Param('photoId', id404) photoId: string,
    @Query('size') size: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const bytes = await this.jobs.photo(scope, id, photoId, size === 'thumb' ? 'thumb' : 'full');
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Content-Length', String(bytes.length));
    // Photos never change once stored; private because they need the caller's access.
    res.setHeader('Cache-Control', 'private, max-age=86400, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', 'inline');
    res.end(bytes);
  }

  @Delete('jobs/:jobId/photos/:photoId')
  @RequirePermission('workshop.job.read')
  @ApiParam({ name: 'jobId', format: 'uuid' })
  @ApiParam({ name: 'photoId', format: 'uuid' })
  @ApiOperation({ operationId: 'removeJobPhoto', summary: 'Remove a photo (draft only; managers)' })
  @ApiOkResponse({ type: JobCardDto })
  removePhoto(
    @CurrentScope() scope: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('jobId', id404) id: string,
    @Param('photoId', id404) photoId: string,
    @RequestId() rid?: string,
  ): Promise<JobCardDto> {
    return this.jobs.removePhoto(scope, p, id, photoId, ctxOf(p, rid));
  }
}
