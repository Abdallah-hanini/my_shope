import { Module } from '@nestjs/common';
import { AppointmentController } from './appointment.controller';
import { AppointmentService } from './appointment.service';
import { BayController } from './bay.controller';
import { BayService } from './bay.service';
import { JobController } from './job.controller';
import { JobService } from './job.service';
import { LabourController } from './labour.controller';
import { LabourService } from './labour.service';

@Module({
  controllers: [JobController, AppointmentController, LabourController, BayController],
  providers: [JobService, AppointmentService, LabourService, BayService],
})
export class WorkshopModule {}
