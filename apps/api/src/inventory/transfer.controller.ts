import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
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
  cancelTransferSchema,
  createTransferSchema,
  transferListQuerySchema,
  type CancelTransferInput,
  type CreateTransferInput,
  type TransferListQuery,
} from '@erp/validation';
import { CurrentPrincipal, CurrentScope, RequestId, RequirePermission } from '../auth/decorators';
import type { CompanyScope, Principal } from '../auth/principal';
import { ZodPipe } from '../common/zod.pipe';
import { CancelTransferDto, CreateTransferDto, TransferDto, TransferListDto } from './transfer.dto';
import { TransferService } from './transfer.service';

const id404 = new ParseUUIDPipe({ errorHttpStatusCode: 404 });
const ctxOf = (p: Principal, requestId?: string) => ({ actorUserId: p.userId, requestId });

/**
 * Stock transfers between branches (T-78). Reading: inventory.read for either branch. Sending and
 * cancelling: inventory.manage at the sending branch; receiving: at the receiving branch.
 */
@ApiTags('inventory')
@ApiBearerAuth()
@ApiParam({ name: 'companyId', format: 'uuid' })
@Controller({ path: 'companies/:companyId' })
export class TransferController {
  constructor(private readonly transfers: TransferService) {}

  @Get('transfers')
  @RequirePermission('inventory.read')
  @ApiQuery({ name: 'status', required: false, enum: ['open', 'all'] })
  @ApiOperation({ operationId: 'listTransfers', summary: 'Transfers in transit (or all), newest first' })
  @ApiOkResponse({ type: TransferListDto })
  list(
    @CurrentScope() s: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Query(new ZodPipe(transferListQuerySchema)) q: TransferListQuery,
  ) {
    return this.transfers.list(s, p, q);
  }

  @Post('transfers')
  @RequirePermission('inventory.read')
  @ApiOperation({
    operationId: 'sendTransfer',
    summary: 'Send stock to another branch (out at average cost into stock in transit)',
  })
  @ApiBody({ type: CreateTransferDto })
  @ApiCreatedResponse({ type: TransferDto })
  create(
    @CurrentScope() s: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Body(new ZodPipe(createTransferSchema)) b: CreateTransferInput,
    @RequestId() rid?: string,
  ) {
    return this.transfers.create(s, p, b, ctxOf(p, rid));
  }

  @Get('transfers/:transferId')
  @RequirePermission('inventory.read')
  @ApiParam({ name: 'transferId', format: 'uuid' })
  @ApiOperation({ operationId: 'getTransfer' })
  @ApiOkResponse({ type: TransferDto })
  get(
    @CurrentScope() s: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('transferId', id404) id: string,
  ) {
    return this.transfers.get(s, p, id);
  }

  @Post('transfers/:transferId/receive')
  @HttpCode(200)
  @RequirePermission('inventory.read')
  @ApiParam({ name: 'transferId', format: 'uuid' })
  @ApiOperation({ operationId: 'receiveTransfer', summary: 'Confirm arrival: in at the value sent' })
  @ApiOkResponse({ type: TransferDto })
  receive(
    @CurrentScope() s: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('transferId', id404) id: string,
    @RequestId() rid?: string,
  ) {
    return this.transfers.receive(s, p, id, ctxOf(p, rid));
  }

  @Post('transfers/:transferId/cancel')
  @HttpCode(200)
  @RequirePermission('inventory.read')
  @ApiParam({ name: 'transferId', format: 'uuid' })
  @ApiOperation({
    operationId: 'cancelTransfer',
    summary: 'Cancel while in transit: stock back at the source',
  })
  @ApiBody({ type: CancelTransferDto })
  @ApiOkResponse({ type: TransferDto })
  cancel(
    @CurrentScope() s: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('transferId', id404) id: string,
    @Body(new ZodPipe(cancelTransferSchema)) b: CancelTransferInput,
    @RequestId() rid?: string,
  ) {
    return this.transfers.cancel(s, p, id, b, ctxOf(p, rid));
  }
}
