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
  @ApiProperty({ example: '1.25', description: 'Closed, not voided time on the task (hours)' })
  actualHours!: string;
  @ApiProperty({ type: () => [ClockedOnDto], description: 'Technicians clocked on to this task now' })
  clockedOn!: ClockedOnDto[];
  @ApiProperty({ description: 'The caller can clock on to this task now' }) canClockOn!: boolean;
  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: "The caller's open entry on this task (to clock off)",
  })
  myOpenEntryId!: string | null;
  @ApiPropertyOptional({
    nullable: true,
    type: Number,
    description: 'Number of the approved additional work this task came from',
  })
  additionSeq!: number | null;
}

export class AdditionTaskDto {
  @ApiProperty() lineNo!: number;
  @ApiProperty() description!: string;
  @ApiProperty({ example: '1.00' }) estimatedHours!: string;
}

export class JobAdditionDto {
  @ApiProperty() id!: string;
  @ApiProperty({ description: '1, 2, … per job' }) seq!: number;
  @ApiProperty() finding!: string;
  @ApiProperty({ enum: ['proposed', 'approved', 'declined', 'withdrawn'] }) status!: string;
  @ApiProperty() proposedByName!: string;
  @ApiProperty({ format: 'date-time' }) proposedAt!: string;
  @ApiProperty({ type: [AdditionTaskDto] }) tasks!: AdditionTaskDto[];
  @ApiProperty({ example: '1.50' }) estimatedHours!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) authorizedByName!: string | null;
  @ApiPropertyOptional({ nullable: true, enum: ['in_person', 'phone', 'written'], type: String })
  authorizedVia!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' }) decidedAt!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) decidedByName!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String, description: 'Why it was declined or withdrawn' })
  closeReason!: string | null;
  @ApiProperty({ description: "The caller can record the customer's decision now" }) canDecide!: boolean;
  @ApiProperty({ description: 'The caller can withdraw it now' }) canWithdraw!: boolean;
}

export class ClockedOnDto {
  @ApiProperty() entryId!: string;
  @ApiProperty() technicianName!: string;
  @ApiProperty({ format: 'date-time' }) since!: string;
}

export class TimeEntryDto {
  @ApiProperty() id!: string;
  @ApiProperty() taskId!: string;
  @ApiProperty() taskLineNo!: number;
  @ApiProperty() technicianId!: string;
  @ApiProperty() technicianName!: string;
  @ApiProperty({ format: 'date-time' }) startedAt!: string;
  @ApiPropertyOptional({
    nullable: true,
    type: String,
    format: 'date-time',
    description: 'null while clocked on',
  })
  endedAt!: string | null;
  @ApiProperty({ description: 'Whole minutes (open entries up to now)' }) minutes!: number;
  @ApiProperty({ enum: ['clock', 'manual'] }) source!: string;
  @ApiPropertyOptional({ nullable: true, type: String, description: 'Why it was entered manually' })
  reason!: string | null;
  @ApiProperty() createdByName!: string;
  @ApiProperty() voided!: boolean;
  @ApiPropertyOptional({ nullable: true, type: String }) voidReason!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) voidedByName!: string | null;
  @ApiProperty({ description: 'The caller can void this entry (a manager, not their own time)' })
  canVoid!: boolean;
  @ApiProperty({ description: 'The caller can clock this open entry off' }) canStop!: boolean;
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
      'inspection',
      'photo_added',
      'photo_removed',
      'addition_proposed',
      'addition_approved',
      'addition_declined',
      'addition_withdrawn',
      'bay',
      'quote_issued',
      'quote_approved',
      'quote_declined',
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
  @ApiPropertyOptional({ nullable: true, type: String, description: 'The bay the car is on' })
  bayId!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String, example: 'B1 — Bay 1' }) bayLabel!: string | null;
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
      'What the caller can do now (edit, inspect, authorize, assign, start, submitQc, qc, deliver, cancel, promise, note, addPhoto, removePhoto, proposeAddition, placeBay); the server checks again',
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
  @ApiProperty({ example: '2.75', description: 'Closed, not voided time on all tasks (hours)' })
  actualHours!: string;
  @ApiProperty({ type: [TimeEntryDto], description: 'Labour time, oldest first, voided included' })
  timeEntries!: TimeEntryDto[];
  @ApiProperty({ description: 'The caller can enter missed time for a technician' })
  canRecordTime!: boolean;
  @ApiProperty({ type: [JobAdditionDto], description: 'Additional work, oldest first' })
  additions!: JobAdditionDto[];
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
export class ManualTimeEntryDto {
  @ApiProperty() taskId!: string;
  @ApiProperty() technicianId!: string;
  @ApiProperty({ format: 'date-time' }) startedAt!: string;
  @ApiProperty({ format: 'date-time' }) endedAt!: string;
  @ApiProperty({ description: 'Why the time was not clocked' }) reason!: string;
}
export class VoidTimeEntryDto {
  @ApiProperty() reason!: string;
}

export class CurrentClockEntryDto {
  @ApiProperty() entryId!: string;
  @ApiProperty() jobId!: string;
  @ApiProperty() jobNumber!: string;
  @ApiProperty() plate!: string;
  @ApiProperty() taskId!: string;
  @ApiProperty() taskLineNo!: number;
  @ApiProperty() taskDescription!: string;
  @ApiProperty({ format: 'date-time' }) since!: string;
}
export class CurrentClockDto {
  @ApiPropertyOptional({
    nullable: true,
    type: CurrentClockEntryDto,
    description: 'The task the caller is clocked on to; null when clocked off',
  })
  entry!: CurrentClockEntryDto | null;
}

export class LabourFiguresDto {
  @ApiProperty({ example: '7.50', description: 'Closed entries started in the range (hours)' })
  clockedHours!: string;
  @ApiProperty() entries!: number;
  @ApiProperty() jobs!: number;
  @ApiProperty({ description: 'Tasks completed in the range' }) tasksDone!: number;
  @ApiProperty({ description: 'Completed tasks with no time from their technician (not in efficiency)' })
  tasksWithoutTime!: number;
  @ApiProperty({ example: '6.00', description: 'Estimate of completed tasks that have time' })
  estimatedHours!: string;
  @ApiProperty({ example: '5.50', description: "The technician's time on those tasks (any date)" })
  actualHours!: string;
  @ApiPropertyOptional({
    nullable: true,
    type: String,
    example: '109.1',
    description: 'estimated ÷ actual × 100; null without time',
  })
  efficiencyPct!: string | null;
}
export class LabourRowDto extends LabourFiguresDto {
  @ApiProperty() technicianId!: string;
  @ApiProperty() technicianName!: string;
}
export class ClockedOnNowDto {
  @ApiProperty() technicianName!: string;
  @ApiProperty() jobId!: string;
  @ApiProperty() jobNumber!: string;
  @ApiProperty() taskDescription!: string;
  @ApiProperty({ format: 'date-time' }) since!: string;
}
export class LabourReportDto {
  @ApiProperty({ example: '2026-11-01' }) from!: string;
  @ApiProperty({ example: '2026-11-30' }) to!: string;
  @ApiProperty() timeZone!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) branchId!: string | null;
  @ApiProperty({ format: 'date-time', description: 'Computed live at this moment' }) asOf!: string;
  @ApiProperty({ type: [LabourRowDto] }) rows!: LabourRowDto[];
  @ApiProperty({ type: LabourFiguresDto }) totals!: LabourFiguresDto;
  @ApiProperty({ type: [ClockedOnNowDto], description: 'Open entries (not in the figures)' })
  clockedOnNow!: ClockedOnNowDto[];
}
export class ProposeAdditionDto {
  @ApiProperty() version!: number;
  @ApiProperty({ description: 'What was found' }) finding!: string;
  @ApiProperty({ type: [JobTaskInputDto] }) tasks!: JobTaskInputDto[];
}
export class DecideAdditionDto {
  @ApiProperty({ enum: ['approve', 'decline'] }) decision!: string;
  @ApiProperty() version!: number;
  @ApiPropertyOptional({ description: 'approve: who authorised it' }) authorizedByName?: string;
  @ApiPropertyOptional({ enum: ['in_person', 'phone', 'written'] }) authorizedVia?: string;
  @ApiPropertyOptional({ description: 'decline: why' }) reason?: string;
}
