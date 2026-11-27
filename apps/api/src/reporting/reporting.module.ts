import { Module } from '@nestjs/common';
import { ReportingController } from './reporting.controller';
import { LedgerService } from './ledger.service';
import { ReportingService } from './reporting.service';
import { StatementsService } from './statements.service';

@Module({
  controllers: [ReportingController],
  providers: [ReportingService, LedgerService, StatementsService],
  exports: [LedgerService, StatementsService],
})
export class ReportingModule {}
