import { Module } from '@nestjs/common';
import { ReportingController } from './reporting.controller';
import { LedgerService } from './ledger.service';
import { ReportingService } from './reporting.service';
import { StatementsService } from './statements.service';
import { AnalyticsService } from './analytics.service';

@Module({
  controllers: [ReportingController],
  providers: [ReportingService, LedgerService, StatementsService, AnalyticsService],
  exports: [LedgerService, StatementsService, AnalyticsService],
})
export class ReportingModule {}
