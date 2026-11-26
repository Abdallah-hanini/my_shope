import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  financialSummaryQuerySchema,
  generalLedgerQuerySchema,
  trialBalanceQuerySchema,
  type FinancialSummaryQuery,
  type GeneralLedgerQuery,
  type TrialBalanceQuery,
} from '@erp/validation';
import { CurrentScope, RequirePermission } from '../auth/decorators';
import type { CompanyScope } from '../auth/principal';
import { ZodPipe } from '../common/zod.pipe';
import { GeneralLedgerDto, TrialBalanceDto } from './ledger.dto';
import { LedgerService } from './ledger.service';
import { FinancialSummaryDto } from './reporting.dto';
import { ReportingService } from './reporting.service';

@ApiTags('reporting')
@ApiBearerAuth()
@ApiParam({ name: 'companyId', format: 'uuid' })
@Controller({ path: 'companies/:companyId/reports' })
export class ReportingController {
  constructor(
    private readonly reporting: ReportingService,
    private readonly ledger: LedgerService,
  ) {}

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

  @Get('trial-balance')
  @RequirePermission('reports.financial.read')
  @ApiOperation({
    operationId: 'getTrialBalance',
    summary: 'Opening, period movements and closing balance per account, from posted journals',
  })
  @ApiQuery({ name: 'from', example: '2026-11-01', description: 'First day (YYYY-MM-DD)' })
  @ApiQuery({ name: 'to', example: '2026-11-30', description: 'Last day (YYYY-MM-DD); at most 3 years' })
  @ApiQuery({ name: 'branchId', required: false, description: 'Limit to one branch' })
  @ApiQuery({
    name: 'includeZero',
    required: false,
    enum: ['true', 'false'],
    description: 'Show accounts without activity',
  })
  @ApiOkResponse({ type: TrialBalanceDto })
  trialBalance(
    @CurrentScope() scope: CompanyScope,
    @Query(new ZodPipe(trialBalanceQuerySchema)) q: TrialBalanceQuery,
  ): Promise<TrialBalanceDto> {
    return this.ledger.trialBalance(scope, q);
  }

  /** Same data as the journal screens, by account; hence the journal permission. */
  @Get('general-ledger')
  @RequirePermission('accounting.journal.read')
  @ApiOperation({
    operationId: 'getGeneralLedger',
    summary: 'Posted lines of one account with opening, running and closing balance',
  })
  @ApiQuery({ name: 'accountId', description: 'A posting account' })
  @ApiQuery({ name: 'from', example: '2026-11-01' })
  @ApiQuery({ name: 'to', example: '2026-11-30' })
  @ApiQuery({ name: 'branchId', required: false })
  @ApiQuery({ name: 'cursor', required: false, description: 'nextCursor of the previous page' })
  @ApiQuery({ name: 'limit', required: false, description: '1–500, default 200' })
  @ApiOkResponse({ type: GeneralLedgerDto })
  generalLedger(
    @CurrentScope() scope: CompanyScope,
    @Query(new ZodPipe(generalLedgerQuerySchema)) q: GeneralLedgerQuery,
  ): Promise<GeneralLedgerDto> {
    return this.ledger.generalLedger(scope, q);
  }
}
