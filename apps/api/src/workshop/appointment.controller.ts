import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
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
  appointmentDayQuerySchema,
  cancelAppointmentSchema,
  createAppointmentSchema,
  jobVersionSchema,
  rescheduleAppointmentSchema,
  workshopScheduleSchema,
  type AppointmentDayQuery,
  type CancelAppointmentInput,
  type CreateAppointmentInput,
  type JobVersionInput,
  type RescheduleAppointmentInput,
  type WorkshopScheduleInput,
} from '@erp/validation';
import { CurrentPrincipal, CurrentScope, RequestId, RequirePermission } from '../auth/decorators';
import type { CompanyScope, Principal } from '../auth/principal';
import { ZodPipe } from '../common/zod.pipe';
import {
  AppointmentDayDto,
  AppointmentDto,
  CreateAppointmentDto,
  RescheduleAppointmentDto,
  SetWorkshopScheduleDto,
  WorkshopScheduleDto,
} from './appointment.dto';
import { CancelJobDto, JobVersionDto } from './job.dto';
import { AppointmentService } from './appointment.service';

const id404 = new ParseUUIDPipe({ errorHttpStatusCode: 404 });
const ctxOf = (p: Principal, requestId?: string) => ({ actorUserId: p.userId, requestId });

/**
 * Workshop hours and appointments. Viewing needs workshop.job.read (branch scope); booking,
 * changing and setting hours need workshop.job.manage on the branch.
 */
@ApiTags('workshop')
@ApiBearerAuth()
@ApiParam({ name: 'companyId', format: 'uuid' })
@Controller({ path: 'companies/:companyId' })
export class AppointmentController {
  constructor(private readonly appointments: AppointmentService) {}

  @Get('branches/:branchId/workshop-schedule')
  @RequirePermission('workshop.job.read')
  @ApiParam({ name: 'branchId', format: 'uuid' })
  @ApiOperation({ operationId: 'getWorkshopSchedule' })
  @ApiOkResponse({ type: WorkshopScheduleDto })
  schedule(
    @CurrentScope() scope: CompanyScope,
    @Param('branchId', id404) branchId: string,
  ): Promise<WorkshopScheduleDto> {
    return this.appointments.schedule(scope, branchId);
  }

  @Put('branches/:branchId/workshop-schedule')
  @RequirePermission('workshop.job.read')
  @ApiParam({ name: 'branchId', format: 'uuid' })
  @ApiOperation({
    operationId: 'setWorkshopSchedule',
    summary: 'Bays, slot length and opening hours (managers)',
  })
  @ApiBody({ type: SetWorkshopScheduleDto })
  @ApiOkResponse({ type: WorkshopScheduleDto })
  setSchedule(
    @CurrentScope() scope: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('branchId', id404) branchId: string,
    @Body(new ZodPipe(workshopScheduleSchema)) body: WorkshopScheduleInput,
    @RequestId() rid?: string,
  ): Promise<WorkshopScheduleDto> {
    return this.appointments.setSchedule(scope, p, branchId, body, ctxOf(p, rid));
  }

  @Get('appointments')
  @RequirePermission('workshop.job.read')
  @ApiOperation({
    operationId: 'getAppointmentDay',
    summary: 'One day of a branch: slots with free bays and the appointments',
  })
  @ApiQuery({ name: 'branchId' })
  @ApiQuery({ name: 'date', example: '2026-12-05', description: 'Local date (company time zone)' })
  @ApiOkResponse({ type: AppointmentDayDto })
  day(
    @CurrentScope() scope: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Query(new ZodPipe(appointmentDayQuerySchema)) q: AppointmentDayQuery,
  ): Promise<AppointmentDayDto> {
    return this.appointments.day(scope, p, q);
  }

  @Post('appointments')
  @RequirePermission('workshop.job.read')
  @ApiOperation({ operationId: 'bookAppointment' })
  @ApiBody({ type: CreateAppointmentDto })
  @ApiCreatedResponse({ type: AppointmentDto })
  create(
    @CurrentScope() scope: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Body(new ZodPipe(createAppointmentSchema)) body: CreateAppointmentInput,
    @RequestId() rid?: string,
  ): Promise<AppointmentDto> {
    return this.appointments.create(scope, p, body, ctxOf(p, rid));
  }

  @Get('appointments/:appointmentId')
  @RequirePermission('workshop.job.read')
  @ApiParam({ name: 'appointmentId', format: 'uuid' })
  @ApiOperation({ operationId: 'getAppointment' })
  @ApiOkResponse({ type: AppointmentDto })
  get(
    @CurrentScope() scope: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('appointmentId', id404) id: string,
  ): Promise<AppointmentDto> {
    return this.appointments.get(scope, p, id);
  }

  @Post('appointments/:appointmentId/reschedule')
  @HttpCode(200)
  @RequirePermission('workshop.job.read')
  @ApiParam({ name: 'appointmentId', format: 'uuid' })
  @ApiOperation({ operationId: 'rescheduleAppointment' })
  @ApiBody({ type: RescheduleAppointmentDto })
  @ApiOkResponse({ type: AppointmentDto })
  reschedule(
    @CurrentScope() scope: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('appointmentId', id404) id: string,
    @Body(new ZodPipe(rescheduleAppointmentSchema)) body: RescheduleAppointmentInput,
    @RequestId() rid?: string,
  ): Promise<AppointmentDto> {
    return this.appointments.reschedule(scope, p, id, body, ctxOf(p, rid));
  }

  @Post('appointments/:appointmentId/cancel')
  @HttpCode(200)
  @RequirePermission('workshop.job.read')
  @ApiParam({ name: 'appointmentId', format: 'uuid' })
  @ApiOperation({ operationId: 'cancelAppointment' })
  @ApiBody({ type: CancelJobDto })
  @ApiOkResponse({ type: AppointmentDto })
  cancel(
    @CurrentScope() scope: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('appointmentId', id404) id: string,
    @Body(new ZodPipe(cancelAppointmentSchema)) body: CancelAppointmentInput,
    @RequestId() rid?: string,
  ): Promise<AppointmentDto> {
    return this.appointments.cancel(scope, p, id, body, ctxOf(p, rid));
  }

  @Post('appointments/:appointmentId/no-show')
  @HttpCode(200)
  @RequirePermission('workshop.job.read')
  @ApiParam({ name: 'appointmentId', format: 'uuid' })
  @ApiOperation({ operationId: 'markAppointmentNoShow', summary: 'After the appointment time' })
  @ApiBody({ type: JobVersionDto })
  @ApiOkResponse({ type: AppointmentDto })
  noShow(
    @CurrentScope() scope: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('appointmentId', id404) id: string,
    @Body(new ZodPipe(jobVersionSchema)) body: JobVersionInput,
    @RequestId() rid?: string,
  ): Promise<AppointmentDto> {
    return this.appointments.noShow(scope, p, id, body, ctxOf(p, rid));
  }
}
