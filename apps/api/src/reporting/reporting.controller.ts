import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  asOfQuerySchema,
  rangeQuerySchema,
  type RangeQuery,
  profitAndLossQuerySchema,
  type AsOfQuery,
  type ProfitAndLossQuery,
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
import { AnalyticsService } from './analytics.service';
import {
  CustomersReportDto,
  OperationsReportDto,
  SalesReportDto,
  StockMovementReportDto,
} from './analytics.dto';
import { AgingDto, BalanceSheetDto, CashFlowDto, ProfitAndLossDto, TaxSummaryDto } from './statements.dto';
import { StatementsService } from './statements.service';

@ApiTags('reporting')
@ApiBearerAuth()
@ApiParam({ name: 'companyId', format: 'uuid' })
@Controller({ path: 'companies/:companyId/reports' })
export class ReportingController {
  constructor(
    private readonly reporting: ReportingService,
    private readonly ledger: LedgerService,
    private readonly statements: StatementsService,
    private readonly analytics: AnalyticsService,
  ) {}

  @Get('cash-flow')
  @RequirePermission('reports.financial.read')
  @ApiOperation({
    operationId: 'getCashFlow',
    summary: 'Cash and bank movements by source, opening to closing',
  })
  @ApiQuery({ name: 'from', required: true })
  @ApiQuery({ name: 'to', required: true })
  @ApiQuery({ name: 'branchId', required: false })
  @ApiOkResponse({ type: CashFlowDto })
  cashFlow(@CurrentScope() s: CompanyScope, @Query(new ZodPipe(rangeQuerySchema)) q: RangeQuery) {
    return this.statements.cashFlow(s, q);
  }

  @Get('tax-summary')
  @RequirePermission('reports.financial.read')
  @ApiOperation({
    operationId: 'getTaxSummary',
    summary: 'Output and input tax by code, checked against the tax accounts',
  })
  @ApiQuery({ name: 'from', required: true })
  @ApiQuery({ name: 'to', required: true })
  @ApiQuery({ name: 'branchId', required: false })
  @ApiOkResponse({ type: TaxSummaryDto })
  taxSummary(@CurrentScope() s: CompanyScope, @Query(new ZodPipe(rangeQuerySchema)) q: RangeQuery) {
    return this.statements.taxSummary(s, q);
  }

  @Get('sales')
  @RequirePermission('reports.financial.read')
  @ApiOperation({
    operationId: 'getSalesReport',
    summary: 'Sales: labour and parts revenue, branches, months, top items',
  })
  @ApiQuery({ name: 'from', required: true })
  @ApiQuery({ name: 'to', required: true })
  @ApiQuery({ name: 'branchId', required: false })
  @ApiOkResponse({ type: SalesReportDto })
  sales(@CurrentScope() s: CompanyScope, @Query(new ZodPipe(rangeQuerySchema)) q: RangeQuery) {
    return this.analytics.sales(s, q);
  }

  @Get('customers')
  @RequirePermission('reports.financial.read')
  @ApiOperation({
    operationId: 'getCustomersReport',
    summary: 'Customers: new, active, returning, top by sales',
  })
  @ApiQuery({ name: 'from', required: true })
  @ApiQuery({ name: 'to', required: true })
  @ApiQuery({ name: 'branchId', required: false })
  @ApiOkResponse({ type: CustomersReportDto })
  customers(@CurrentScope() s: CompanyScope, @Query(new ZodPipe(rangeQuerySchema)) q: RangeQuery) {
    return this.analytics.customers(s, q);
  }

  @Get('operations')
  @RequirePermission('workshop.job.read')
  @ApiOperation({
    operationId: 'getOperationsReport',
    summary: 'Workshop: jobs opened and delivered, time to deliver, first-time right, open now',
  })
  @ApiQuery({ name: 'from', required: true })
  @ApiQuery({ name: 'to', required: true })
  @ApiQuery({ name: 'branchId', required: false })
  @ApiOkResponse({ type: OperationsReportDto })
  operations(@CurrentScope() s: CompanyScope, @Query(new ZodPipe(rangeQuerySchema)) q: RangeQuery) {
    return this.analytics.operations(s, q);
  }

  @Get('stock-movement')
  @RequirePermission('inventory.read')
  @ApiOperation({
    operationId: 'getStockMovementReport',
    summary: 'Stock flow per part: issued, received, turnover, fast/slow/dead',
  })
  @ApiQuery({ name: 'from', required: true })
  @ApiQuery({ name: 'to', required: true })
  @ApiQuery({ name: 'branchId', required: false })
  @ApiOkResponse({ type: StockMovementReportDto })
  stockMovement(@CurrentScope() s: CompanyScope, @Query(new ZodPipe(rangeQuerySchema)) q: RangeQuery) {
    return this.analytics.stockMovement(s, q);
  }

  @Get('profit-and-loss')
  @RequirePermission('reports.financial.read')
  @ApiOperation({
    operationId: 'getProfitAndLoss',
    summary: 'Profit and loss by account, with the previous period',
  })
  @ApiQuery({ name: 'from', required: true })
  @ApiQuery({ name: 'to', required: true })
  @ApiQuery({ name: 'branchId', required: false })
  @ApiQuery({ name: 'compare', required: false, enum: ['none', 'previous'] })
  @ApiOkResponse({ type: ProfitAndLossDto })
  profitAndLoss(
    @CurrentScope() s: CompanyScope,
    @Query(new ZodPipe(profitAndLossQuerySchema)) q: ProfitAndLossQuery,
  ) {
    return this.statements.profitAndLoss(s, q);
  }

  @Get('balance-sheet')
  @RequirePermission('reports.financial.read')
  @ApiOperation({ operationId: 'getBalanceSheet', summary: 'Assets, liabilities and equity at a date' })
  @ApiQuery({ name: 'asOf', required: true })
  @ApiQuery({ name: 'branchId', required: false })
  @ApiOkResponse({ type: BalanceSheetDto })
  balanceSheet(@CurrentScope() s: CompanyScope, @Query(new ZodPipe(asOfQuerySchema)) q: AsOfQuery) {
    return this.statements.balanceSheet(s, q);
  }

  @Get('receivables-aging')
  @RequirePermission('reports.financial.read')
  @ApiOperation({ operationId: 'getReceivablesAging', summary: 'Open customer invoices by age, reconciled' })
  @ApiQuery({ name: 'asOf', required: true })
  @ApiQuery({ name: 'branchId', required: false })
  @ApiOkResponse({ type: AgingDto })
  receivables(@CurrentScope() s: CompanyScope, @Query(new ZodPipe(asOfQuerySchema)) q: AsOfQuery) {
    return this.statements.receivablesAging(s, q);
  }

  @Get('payables-aging')
  @RequirePermission('reports.financial.read')
  @ApiOperation({
    operationId: 'getPayablesAging',
    summary: 'Open supplier bills by days past due, reconciled',
  })
  @ApiQuery({ name: 'asOf', required: true })
  @ApiQuery({ name: 'branchId', required: false })
  @ApiOkResponse({ type: AgingDto })
  payables(@CurrentScope() s: CompanyScope, @Query(new ZodPipe(asOfQuerySchema)) q: AsOfQuery) {
    return this.statements.payablesAging(s, q);
  }

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
