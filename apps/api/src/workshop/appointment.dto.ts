import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { JobPartyDto, JobVehicleDto } from './job.dto';

export class WorkshopHoursDto {
  @ApiProperty({ description: '0 = Sunday … 6 = Saturday' }) weekday!: number;
  @ApiProperty({ example: '08:00' }) opens!: string;
  @ApiProperty({ example: '17:00' }) closes!: string;
}

export class WorkshopScheduleDto {
  @ApiProperty() branchId!: string;
  @ApiProperty({ description: 'false until a manager sets the hours; booking is refused until then' })
  configured!: boolean;
  @ApiProperty() bays!: number;
  @ApiProperty({ enum: [15, 30, 60] }) slotMinutes!: number;
  @ApiProperty({ type: [WorkshopHoursDto], description: 'Open days only, in the company time zone' })
  hours!: WorkshopHoursDto[];
  @ApiProperty({ description: '0 = never saved' }) version!: number;
}

export class AppointmentDto {
  @ApiProperty() id!: string;
  @ApiProperty() branchId!: string;
  @ApiProperty() branchCode!: string;
  @ApiProperty({ type: JobPartyDto }) customer!: JobPartyDto;
  @ApiProperty({ type: JobVehicleDto }) vehicle!: JobVehicleDto;
  @ApiProperty({ format: 'date-time' }) startsAt!: string;
  @ApiProperty({ format: 'date-time' }) endsAt!: string;
  @ApiProperty() durationMinutes!: number;
  @ApiProperty() service!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) notes!: string | null;
  @ApiProperty({ enum: ['booked', 'checked_in', 'cancelled', 'no_show'] }) status!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) jobId!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) jobNumber!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) cancelledReason!: string | null;
  @ApiProperty() createdByName!: string;
  @ApiProperty() version!: number;
  @ApiProperty({
    type: [String],
    description: 'checkIn, reschedule, cancel, noShow — what the caller can do now',
  })
  actions!: string[];
}

export class SlotDto {
  @ApiProperty({ format: 'date-time' }) start!: string;
  @ApiProperty({ format: 'date-time' }) end!: string;
  @ApiProperty({ description: 'Most cars booked at once in this slot' }) booked!: number;
  @ApiProperty() free!: number;
}

export class AppointmentDayDto {
  @ApiProperty() branchId!: string;
  @ApiProperty({ example: '2026-12-05' }) date!: string;
  @ApiProperty({ example: 'Asia/Qatar' }) timeZone!: string;
  @ApiProperty({ type: WorkshopScheduleDto }) schedule!: WorkshopScheduleDto;
  @ApiProperty({ type: [SlotDto], description: 'Empty when the workshop is closed or not configured' })
  slots!: SlotDto[];
  @ApiProperty({ type: [AppointmentDto], description: 'All appointments starting that day, by time' })
  appointments!: AppointmentDto[];
}

// Request bodies (validated by the shared Zod schemas).
export class SetWorkshopScheduleDto {
  @ApiProperty({ description: 'Current version (0 when never saved)' }) version!: number;
  @ApiProperty() bays!: number;
  @ApiProperty({ enum: [15, 30, 60] }) slotMinutes!: number;
  @ApiProperty({ type: [WorkshopHoursDto] }) hours!: WorkshopHoursDto[];
}
export class CreateAppointmentDto {
  @ApiProperty() branchId!: string;
  @ApiProperty() vehicleId!: string;
  @ApiProperty({ format: 'date-time' }) startsAt!: string;
  @ApiProperty() durationMinutes!: number;
  @ApiProperty() service!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) notes?: string | null;
}
export class RescheduleAppointmentDto {
  @ApiProperty() version!: number;
  @ApiProperty({ format: 'date-time' }) startsAt!: string;
  @ApiProperty() durationMinutes!: number;
}
