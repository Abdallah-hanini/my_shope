import { Module } from '@nestjs/common';
import { ReportingModule } from '../reporting/reporting.module';
import { ExportBuilders } from './builders';
import { ExportController } from './export.controller';
import { ExportQueue } from './export.queue';
import { ExportService } from './export.service';

@Module({
  imports: [ReportingModule],
  controllers: [ExportController],
  providers: [ExportService, ExportBuilders, ExportQueue],
  exports: [ExportService, ExportQueue],
})
export class ExportModule {}
