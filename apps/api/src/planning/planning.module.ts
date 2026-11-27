import { Module } from '@nestjs/common';
import { ReportingModule } from '../reporting/reporting.module';
import { AlertsController, PlanningController } from './planning.controller';
import { PlanningService } from './planning.service';

@Module({
  imports: [ReportingModule],
  controllers: [PlanningController, AlertsController],
  providers: [PlanningService],
})
export class PlanningModule {}
