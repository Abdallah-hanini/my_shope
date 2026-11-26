import { Module } from '@nestjs/common';
import { ReportingController } from './reporting.controller';
import { LedgerService } from './ledger.service';
import { ReportingService } from './reporting.service';

@Module({
  controllers: [ReportingController],
  providers: [ReportingService, LedgerService],
  exports: [LedgerService],
})
export class ReportingModule {}
