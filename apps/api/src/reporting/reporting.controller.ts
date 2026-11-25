import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { financialSummaryQuerySchema, type FinancialSummaryQuery } from '@erp/validation';
import { CurrentScope, RequirePermission } from '../auth/decorators';
import type { CompanyScope } from '../auth/principal';
import { ZodPipe } from '../common/zod.pipe';
import { FinancialSummaryDto } from './reporting.dto';
import { ReportingService } from './reporting.service';

@ApiTags('reporting')
@ApiBearerAuth()
@ApiParam({ name: 'companyId', format: 'uuid' })
@Controller({ path: 'companies/:companyId/reports' })
export class ReportingController {
  constructor(private readonly reporting: ReportingService) {}

  @Get('financial-summary')
  @RequirePermission('reports.financial.read')
  @ApiOperation({
    operationId: 'getFinancialSummary',
    summary: 'Revenue, gross and net profit, expenses, cash and trends from posted journals',
  })
  @ApiQuery({ name: 'from', example: '2026-01', description: 'First month (YYYY-MM)' })
  @ApiQuery({ name: 'to', example: '2026-12', description: 'Last month (YYYY-MM); at most 24 months' })
  @ApiQuery({ name: 'branchId', required: false, description: 'Limit to one branch' })
  @ApiOkResponse({ type: FinancialSummaryDto })
  summary(
    @CurrentScope() scope: CompanyScope,
    @Query(new ZodPipe(financialSummaryQuerySchema)) q: FinancialSummaryQuery,
  ): Promise<FinancialSummaryDto> {
    return this.reporting.financialSummary(scope, q);
  }
}
