import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  adjustStockSchema,
  createPartSchema,
  partListQuerySchema,
  receiveStockSchema,
  updatePartSchema,
  type AdjustStockInput,
  type CreatePartInput,
  type PartListQuery,
  type ReceiveStockInput,
  type UpdatePartInput,
} from '@erp/validation';
import { z } from 'zod';
import { CurrentPrincipal, CurrentScope, RequestId, RequirePermission } from '../auth/decorators';
import type { CompanyScope, Principal } from '../auth/principal';
import { ZodPipe } from '../common/zod.pipe';
import {
  AdjustStockDto,
  CreatePartDto,
  PartDto,
  PartListDto,
  ReceiveStockDto,
  UpdatePartDto,
  ValuationDto,
} from './inventory.dto';
import { InventoryService } from './inventory.service';

const id404 = new ParseUUIDPipe({ errorHttpStatusCode: 404 });
const ctxOf = (p: Principal, requestId?: string) => ({ actorUserId: p.userId, requestId });
const valuationQuery = z.object({ branchId: z.string().uuid().optional() });

/**
 * Parts and stock (T-74). Reading: inventory.read (branch scope). Catalogue: inventory.manage for
 * the whole company. Receipts: inventory.manage at the branch. Adjustments: inventory.adjust.
 */
@ApiTags('inventory')
@ApiBearerAuth()
@ApiParam({ name: 'companyId', format: 'uuid' })
@Controller({ path: 'companies/:companyId' })
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get('parts')
  @RequirePermission('inventory.read')
  @ApiOperation({ operationId: 'listParts', summary: 'Catalogue with stock in the caller’s branches' })
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'branchId', required: false })
  @ApiQuery({ name: 'includeInactive', required: false, enum: ['true', 'false'] })
  @ApiOkResponse({ type: PartListDto })
  list(
    @CurrentScope() s: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Query(new ZodPipe(partListQuerySchema)) q: PartListQuery,
  ) {
    return this.inventory.list(s, p, q);
  }

  @Post('parts')
  @RequirePermission('inventory.read')
  @ApiOperation({ operationId: 'createPart' })
  @ApiBody({ type: CreatePartDto })
  @ApiCreatedResponse({ type: PartDto })
  create(
    @CurrentScope() s: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Body(new ZodPipe(createPartSchema)) b: CreatePartInput,
    @RequestId() rid?: string,
  ) {
    return this.inventory.create(s, p, b, ctxOf(p, rid));
  }

  @Get('parts/:partId')
  @RequirePermission('inventory.read')
  @ApiParam({ name: 'partId', format: 'uuid' })
  @ApiOperation({ operationId: 'getPart', summary: 'A part with stock per branch and its movements' })
  @ApiOkResponse({ type: PartDto })
  get(@CurrentScope() s: CompanyScope, @CurrentPrincipal() p: Principal, @Param('partId', id404) id: string) {
    return this.inventory.get(s, p, id);
  }

  @Patch('parts/:partId')
  @RequirePermission('inventory.read')
  @ApiParam({ name: 'partId', format: 'uuid' })
  @ApiOperation({ operationId: 'updatePart' })
  @ApiBody({ type: UpdatePartDto })
  @ApiOkResponse({ type: PartDto })
  update(
    @CurrentScope() s: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('partId', id404) id: string,
    @Body(new ZodPipe(updatePartSchema)) b: UpdatePartInput,
    @RequestId() rid?: string,
  ) {
    return this.inventory.update(s, p, id, b, ctxOf(p, rid));
  }

  @Post('parts/:partId/receipts')
  @RequirePermission('inventory.read')
  @ApiParam({ name: 'partId', format: 'uuid' })
  @ApiOperation({
    operationId: 'receiveStock',
    summary: 'Goods received at a cost; posted Dr inventory, Cr goods received',
  })
  @ApiBody({ type: ReceiveStockDto })
  @ApiCreatedResponse({ type: PartDto })
  receive(
    @CurrentScope() s: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('partId', id404) id: string,
    @Body(new ZodPipe(receiveStockSchema)) b: ReceiveStockInput,
    @RequestId() rid?: string,
  ) {
    return this.inventory.receive(s, p, id, b, ctxOf(p, rid));
  }

  @Post('parts/:partId/adjustments')
  @RequirePermission('inventory.read')
  @ApiParam({ name: 'partId', format: 'uuid' })
  @ApiOperation({
    operationId: 'adjustStock',
    summary: 'A counted difference with a reason, against stock adjustments',
  })
  @ApiBody({ type: AdjustStockDto })
  @ApiCreatedResponse({ type: PartDto })
  adjust(
    @CurrentScope() s: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('partId', id404) id: string,
    @Body(new ZodPipe(adjustStockSchema)) b: AdjustStockInput,
    @RequestId() rid?: string,
  ) {
    return this.inventory.adjust(s, p, id, b, ctxOf(p, rid));
  }

  @Get('inventory/valuation')
  @RequirePermission('inventory.read')
  @ApiOperation({
    operationId: 'getStockValuation',
    summary: 'Stock value by part, reconciled to the inventory account',
  })
  @ApiQuery({ name: 'branchId', required: false })
  @ApiOkResponse({ type: ValuationDto })
  valuation(
    @CurrentScope() s: CompanyScope,
    @Query(new ZodPipe(valuationQuery)) q: z.infer<typeof valuationQuery>,
  ) {
    return this.inventory.valuation(s, q.branchId);
  }
}
