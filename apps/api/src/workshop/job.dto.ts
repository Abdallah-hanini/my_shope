import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class JobTaskDto {
  @ApiProperty() id!: string;
  @ApiProperty() lineNo!: number;
  @ApiProperty() description!: string;
  @ApiProperty({ example: '1.50' }) estimatedHours!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) technicianId!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) technicianName!: string | null;
  @ApiProperty({ enum: ['open', 'done'] }) status!: string;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' }) doneAt!: string | null;
  @ApiProperty({ description: 'The caller can mark this task done now' }) canComplete!: boolean;
}

export class JobEventDto {
  @ApiProperty() id!: string;
  @ApiProperty({ format: 'date-time' }) occurredAt!: string;
  @ApiProperty() actorName!: string;
  @ApiProperty({
    enum: [
      'created',
      'status',
      'assignment',
      'task_done',
      'task_reopened',
      'qc_pass',
      'qc_fail',
      'note',
      'updated',
    ],
  })
  kind!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) fromStatus!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) toStatus!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) note!: string | null;
}

export class JobPartyDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) nameAr!: string | null;
  @ApiProperty() phone!: string;
}

export class JobVehicleDto {
  @ApiProperty() id!: string;
  @ApiProperty() plate!: string;
  @ApiProperty() make!: string;
  @ApiProperty() model!: string;
  @ApiPropertyOptional({ nullable: true, type: Number }) year!: number | null;
}

const STATUS = [
  'draft',
  'approved',
  'assigned',
  'in_progress',
  'rework',
  'qc',
  'ready',
  'delivered',
  'cancelled',
];

export class JobListItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() number!: string;
  @ApiProperty({ enum: STATUS }) status!: string;
  @ApiProperty() branchId!: string;
  @ApiProperty() branchCode!: string;
  @ApiProperty() plate!: string;
  @ApiProperty() vehicleName!: string;
  @ApiProperty() customerName!: string;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' }) promisedAt!: string | null;
  @ApiProperty({ description: 'Promised time has passed and the job is not ready, delivered or cancelled' })
  overdue!: boolean;
  @ApiProperty({ type: [String] }) technicianNames!: string[];
  @ApiProperty() tasksDone!: number;
  @ApiProperty() tasksTotal!: number;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class JobCardDto {
  @ApiProperty() id!: string;
  @ApiProperty() number!: string;
  @ApiProperty({ enum: STATUS }) status!: string;
  @ApiProperty() branchId!: string;
  @ApiProperty() branchCode!: string;
  @ApiProperty({ type: JobPartyDto }) customer!: JobPartyDto;
  @ApiProperty({ type: JobVehicleDto }) vehicle!: JobVehicleDto;
  @ApiProperty() complaint!: string;
  @ApiProperty() odometerIn!: number;
  @ApiProperty({ enum: ['empty', 'quarter', 'half', 'three_quarters', 'full'] }) fuelLevel!: string;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' }) promisedAt!: string | null;
  @ApiProperty() overdue!: boolean;
  @ApiPropertyOptional({ nullable: true, type: String }) authorizedByName!: string | null;
  @ApiPropertyOptional({ nullable: true, enum: ['in_person', 'phone', 'written'], type: String })
  authorizedVia!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' }) authorizedAt!: string | null;
  @ApiProperty() reworkCount!: number;
  @ApiPropertyOptional({ nullable: true, type: String }) deliveredToName!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' }) deliveredAt!: string | null;
  @ApiPropertyOptional({ nullable: true, type: Number }) odometerOut!: number | null;
  @ApiPropertyOptional({ nullable: true, type: String }) cancelledReason!: string | null;
  @ApiProperty() createdByName!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty() version!: number;
  @ApiProperty({ example: '3.50' }) estimatedHours!: string;
  @ApiProperty({ type: [JobTaskDto] }) tasks!: JobTaskDto[];
  @ApiProperty({ type: [JobEventDto], description: 'Timeline, oldest first' }) events!: JobEventDto[];
  @ApiProperty({
    type: [String],
    description:
      'What the caller can do now (edit, authorize, assign, start, submitQc, qc, deliver, cancel, promise, note); the server checks again',
  })
  actions!: string[];
}

export class TechnicianDto {
  @ApiProperty() id!: string;
  @ApiProperty() displayName!: string;
}

// Request bodies (validated by the shared Zod schemas; these document them).
export class JobTaskInputDto {
  @ApiProperty() description!: string;
  @ApiProperty({ example: '1.5' }) estimatedHours!: string;
}
export class CreateJobDto {
  @ApiProperty() branchId!: string;
  @ApiProperty() vehicleId!: string;
  @ApiProperty() complaint!: string;
  @ApiProperty() odometerIn!: number;
  @ApiProperty({ enum: ['empty', 'quarter', 'half', 'three_quarters', 'full'] }) fuelLevel!: string;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' }) promisedAt?: string | null;
  @ApiProperty({ type: [JobTaskInputDto] }) tasks!: JobTaskInputDto[];
}
export class UpdateJobDraftDto {
  @ApiProperty() complaint!: string;
  @ApiProperty() odometerIn!: number;
  @ApiProperty() fuelLevel!: string;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' }) promisedAt?: string | null;
  @ApiProperty({ type: [JobTaskInputDto] }) tasks!: JobTaskInputDto[];
  @ApiProperty() version!: number;
}
export class AuthorizeJobDto {
  @ApiProperty() version!: number;
  @ApiProperty({ description: 'The person who authorised the work' }) authorizedByName!: string;
  @ApiProperty({ enum: ['in_person', 'phone', 'written'] }) authorizedVia!: string;
}
export class AssignTaskDto {
  @ApiProperty() version!: number;
  @ApiPropertyOptional({ nullable: true, type: String, description: 'null removes the technician' })
  technicianId!: string | null;
}
export class JobVersionDto {
  @ApiProperty() version!: number;
}
export class PromiseJobDto {
  @ApiProperty() version!: number;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' }) promisedAt!: string | null;
}
export class QcResultDto {
  @ApiProperty({ enum: ['pass', 'fail'] }) result!: string;
  @ApiProperty() version!: number;
  @ApiPropertyOptional({ description: 'Required when failing' }) note?: string;
  @ApiPropertyOptional({ type: [String], description: 'Tasks to redo (fail only, at least one)' })
  reopenTaskIds?: string[];
}
export class DeliverJobDto {
  @ApiProperty() version!: number;
  @ApiProperty() deliveredToName!: string;
  @ApiProperty() odometerOut!: number;
}
export class CancelJobDto {
  @ApiProperty() version!: number;
  @ApiProperty() reason!: string;
}
export class JobNoteDto {
  @ApiProperty() note!: string;
}
