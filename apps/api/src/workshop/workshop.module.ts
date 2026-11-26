import { Module } from '@nestjs/common';
import { AppointmentController } from './appointment.controller';
import { AppointmentService } from './appointment.service';
import { JobController } from './job.controller';
import { JobService } from './job.service';

@Module({ controllers: [JobController, AppointmentController], providers: [JobService, AppointmentService] })
export class WorkshopModule {}
