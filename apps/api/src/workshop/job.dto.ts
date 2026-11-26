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

export class InspectionItemDto {
  @ApiProperty({ description: 'Checklist key (INSPECTION_ITEMS)' }) key!: string;
  @ApiProperty({ enum: ['ok', 'attention', 'not_checked'] }) status!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) note!: string | null;
}

export class InspectionDto {
  @ApiProperty({ format: 'date-time' }) recordedAt!: string;
  @ApiProperty() recordedByName!: string;
  @ApiProperty({ type: [InspectionItemDto] }) items!: InspectionItemDto[];
}

export class JobPhotoDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['front', 'rear', 'left', 'right', 'interior', 'odometer', 'damage', 'other'] })
  area!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) caption!: string | null;
  @ApiProperty() width!: number;
  @ApiProperty() height!: number;
  @ApiProperty() sizeBytes!: number;
  @ApiProperty() uploadedByName!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class RecordInspectionDto {
  @ApiProperty() version!: number;
  @ApiProperty({
    type: [InspectionItemDto],
    description: 'Every checklist item once; "attention" needs a note',
  })
  items!: InspectionItemDto[];
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
      'What the caller can do now (edit, inspect, authorize, assign, start, submitQc, qc, deliver, cancel, promise, note, addPhoto, removePhoto); the server checks again',
  })
  actions!: string[];
  @ApiPropertyOptional({
    nullable: true,
    type: InspectionDto,
    description: 'Check-in inspection; null until recorded',
  })
  inspection!: InspectionDto | null;
  @ApiProperty({ type: [JobPhotoDto], description: 'Oldest first; images at …/photos/{photoId}' })
  photos!: JobPhotoDto[];
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
  @ApiPropertyOptional({ nullable: true, type: String, description: 'Check-in of this booked appointment' })
  appointmentId?: string | null;
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
