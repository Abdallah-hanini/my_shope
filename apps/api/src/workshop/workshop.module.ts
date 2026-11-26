import { Module } from '@nestjs/common';
import { AppointmentController } from './appointment.controller';
import { AppointmentService } from './appointment.service';
import { JobController } from './job.controller';
import { JobService } from './job.service';
import { LabourController } from './labour.controller';
import { LabourService } from './labour.service';

@Module({
  controllers: [JobController, AppointmentController, LabourController],
  providers: [JobService, AppointmentService, LabourService],
})
export class WorkshopModule {}
