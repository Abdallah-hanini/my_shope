import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Put, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  lowStockQuerySchema,
  reorderLevelSchema,
  salesTargetSchema,
  targetsQuerySchema,
  type LowStockQuery,
  type ReorderLevelInput,
  type SalesTargetInput,
  type TargetsQuery,
} from '@erp/validation';
import { CurrentPrincipal, CurrentScope, RequestId, RequirePermission } from '../auth/decorators';
import type { CompanyScope, Principal } from '../auth/principal';
import { ZodPipe } from '../common/zod.pipe';
import {
  AlertsDto,
  LowStockDto,
  ReorderLevelBodyDto,
  ReorderLevelDto,
  SalesTargetBodyDto,
  SalesTargetDto,
  TargetsReportDto,
} from './planning.dto';
import { PlanningService } from './planning.service';

const id404 = new ParseUUIDPipe({ errorHttpStatusCode: 404 });
const ctxOf = (p: Principal, requestId?: string) => ({ actorUserId: p.userId, requestId });

/**
 * R3a planning. Reorder points: inventory.manage at the branch; low-stock list: inventory.read.
 * Targets: reading with reports.financial.read, setting with reports.targets.manage (company target
 * needs the whole company). Alerts: any member, each alert by its own report's permission.
 */
@ApiTags('planning')
@ApiBearerAuth()
@ApiParam({ name: 'companyId', format: 'uuid' })
@Controller({ path: 'companies/:companyId' })
export class PlanningController {
  constructor(private readonly planning: PlanningService) {}

  @Put('parts/:partId/reorder-levels/:branchId')
  @RequirePermission('inventory.manage')
  @ApiParam({ name: 'partId', format: 'uuid' })
  @ApiParam({ name: 'branchId', format: 'uuid' })
  @ApiOperation({ operationId: 'setReorderLevel', summary: 'Set the reorder point of a part at a branch' })
  @ApiBody({ type: ReorderLevelBodyDto })
  @ApiOkResponse({ type: ReorderLevelDto })
  setReorderLevel(
    @CurrentScope() s: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('partId', id404) partId: string,
    @Param('branchId', id404) branchId: string,
    @Body(new ZodPipe(reorderLevelSchema)) b: ReorderLevelInput,
    @RequestId() rid?: string,
  ) {
    return this.planning.setReorderLevel(s, p, partId, branchId, b, ctxOf(p, rid));
  }

  @Delete('parts/:partId/reorder-levels/:branchId')
  @RequirePermission('inventory.manage')
  @HttpCode(204)
  @ApiParam({ name: 'partId', format: 'uuid' })
  @ApiParam({ name: 'branchId', format: 'uuid' })
  @ApiOperation({
    operationId: 'removeReorderLevel',
    summary: 'Remove the reorder point of a part at a branch',
  })
  @ApiNoContentResponse()
  async removeReorderLevel(
    @CurrentScope() s: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('partId', id404) partId: string,
    @Param('branchId', id404) branchId: string,
    @RequestId() rid?: string,
  ) {
    await this.planning.removeReorderLevel(s, partId, branchId, ctxOf(p, rid));
  }

  @Get('reports/low-stock')
  @RequirePermission('inventory.read')
  @ApiOperation({
    operationId: 'getLowStock',
    summary: 'Parts at or below their reorder point, with a suggested order',
  })
  @ApiQuery({ name: 'branchId', required: false })
  @ApiOkResponse({ type: LowStockDto })
  lowStock(@CurrentScope() s: CompanyScope, @Query(new ZodPipe(lowStockQuerySchema)) q: LowStockQuery) {
    return this.planning.lowStock(s, q);
  }

  @Get('reports/targets')
  @RequirePermission('reports.financial.read')
  @ApiOperation({ operationId: 'getSalesTargets', summary: 'Monthly sales targets against actual sales' })
  @ApiQuery({ name: 'year', required: true })
  @ApiQuery({ name: 'branchId', required: false, description: 'Empty: the company target' })
  @ApiOkResponse({ type: TargetsReportDto })
  targets(
    @CurrentScope() s: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Query(new ZodPipe(targetsQuerySchema)) q: TargetsQuery,
  ) {
    return this.planning.targets(s, p, q);
  }

  @Put('sales-targets')
  @RequirePermission('reports.targets.manage')
  @ApiOperation({ operationId: 'setSalesTarget', summary: 'Set a monthly sales target' })
  @ApiBody({ type: SalesTargetBodyDto })
  @ApiOkResponse({ type: SalesTargetDto })
  setTarget(
    @CurrentScope() s: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Body(new ZodPipe(salesTargetSchema)) b: SalesTargetInput,
    @RequestId() rid?: string,
  ) {
    return this.planning.setTarget(s, p, b, ctxOf(p, rid));
  }

  @Delete('sales-targets/:targetId')
  @RequirePermission('reports.targets.manage')
  @HttpCode(204)
  @ApiParam({ name: 'targetId', format: 'uuid' })
  @ApiOperation({ operationId: 'removeSalesTarget', summary: 'Remove a monthly sales target' })
  @ApiNoContentResponse()
  async removeTarget(
    @CurrentScope() s: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('targetId', id404) id: string,
    @RequestId() rid?: string,
  ) {
    await this.planning.removeTarget(s, id, ctxOf(p, rid));
  }
}

@ApiTags('planning')
@ApiBearerAuth()
@Controller({ path: 'companies/:companyId/alerts' })
export class AlertsController {
  constructor(private readonly planning: PlanningService) {}

  /** Any member; each alert only with the permission of the report that explains it. */
  @Get()
  @ApiParam({ name: 'companyId', format: 'uuid' })
  @ApiOperation({
    operationId: 'getAlerts',
    summary: 'Low stock, overdue balances, reconciliation breaks, negative margin, target pace',
  })
  @ApiOkResponse({ type: AlertsDto })
  alerts(@CurrentPrincipal() p: Principal, @Param('companyId', id404) companyId: string) {
    return this.planning.alerts(companyId, p);
  }
}
