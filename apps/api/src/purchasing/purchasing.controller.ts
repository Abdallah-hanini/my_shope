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
  cancelSupplierBillSchema,
  createSupplierBillSchema,
  createSupplierSchema,
  supplierBillListQuerySchema,
  supplierPaymentSchema,
  updateSupplierSchema,
  type CancelSupplierBillInput,
  type CreateSupplierBillInput,
  type CreateSupplierInput,
  type SupplierBillListQuery,
  type SupplierPaymentInput,
  type UpdateSupplierInput,
} from '@erp/validation';
import { z } from 'zod';
import { CurrentPrincipal, CurrentScope, RequestId, RequirePermission } from '../auth/decorators';
import type { CompanyScope, Principal } from '../auth/principal';
import { ZodPipe } from '../common/zod.pipe';
import {
  CancelSupplierBillDto,
  CreateSupplierBillDto,
  CreateSupplierDto,
  SupplierBillDto,
  SupplierBillListDto,
  SupplierDetailDto,
  SupplierListDto,
  SupplierPaymentInputDto,
  UnbilledReceiptsDto,
  UpdateSupplierDto,
} from './purchasing.dto';
import { PurchasingService } from './purchasing.service';

const id404 = new ParseUUIDPipe({ errorHttpStatusCode: 404 });
const ctxOf = (p: Principal, requestId?: string) => ({ actorUserId: p.userId, requestId });
const branchQuery = z.object({ branchId: z.string().uuid() });

/**
 * Suppliers, bills and payments (T-76). Reading: purchasing.read (bills in branch scope).
 * Suppliers: purchasing.manage for the whole company. Bills and cancelling: purchasing.manage at
 * the branch. Payments: purchasing.pay at the branch, not by the person who entered the bill
 * (unless the owner).
 */
@ApiTags('purchasing')
@ApiBearerAuth()
@ApiParam({ name: 'companyId', format: 'uuid' })
@Controller({ path: 'companies/:companyId' })
export class PurchasingController {
  constructor(private readonly purchasing: PurchasingService) {}

  @Get('suppliers')
  @RequirePermission('purchasing.read')
  @ApiOperation({ operationId: 'listSuppliers', summary: 'Suppliers with what is owed to each' })
  @ApiOkResponse({ type: SupplierListDto })
  list(@CurrentScope() s: CompanyScope, @CurrentPrincipal() p: Principal) {
    return this.purchasing.listSuppliers(s, p);
  }

  @Post('suppliers')
  @RequirePermission('purchasing.read')
  @ApiOperation({ operationId: 'createSupplier' })
  @ApiBody({ type: CreateSupplierDto })
  @ApiCreatedResponse({ type: SupplierDetailDto })
  create(
    @CurrentScope() s: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Body(new ZodPipe(createSupplierSchema)) b: CreateSupplierInput,
    @RequestId() rid?: string,
  ) {
    return this.purchasing.createSupplier(s, p, b, ctxOf(p, rid));
  }

  @Get('suppliers/:supplierId')
  @RequirePermission('purchasing.read')
  @ApiParam({ name: 'supplierId', format: 'uuid' })
  @ApiOperation({ operationId: 'getSupplier', summary: 'A supplier with its bills' })
  @ApiOkResponse({ type: SupplierDetailDto })
  get(
    @CurrentScope() s: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('supplierId', id404) id: string,
  ) {
    return this.purchasing.getSupplier(s, p, id);
  }

  @Patch('suppliers/:supplierId')
  @RequirePermission('purchasing.read')
  @ApiParam({ name: 'supplierId', format: 'uuid' })
  @ApiOperation({ operationId: 'updateSupplier' })
  @ApiBody({ type: UpdateSupplierDto })
  @ApiOkResponse({ type: SupplierDetailDto })
  update(
    @CurrentScope() s: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('supplierId', id404) id: string,
    @Body(new ZodPipe(updateSupplierSchema)) b: UpdateSupplierInput,
    @RequestId() rid?: string,
  ) {
    return this.purchasing.updateSupplier(s, p, id, b, ctxOf(p, rid));
  }

  @Get('suppliers/:supplierId/unbilled-receipts')
  @RequirePermission('purchasing.read')
  @ApiParam({ name: 'supplierId', format: 'uuid' })
  @ApiQuery({ name: 'branchId', required: true })
  @ApiOperation({ operationId: 'listUnbilledReceipts', summary: 'Receipts at a branch not yet on a bill' })
  @ApiOkResponse({ type: UnbilledReceiptsDto })
  unbilled(
    @CurrentScope() s: CompanyScope,
    @Param('supplierId', id404) id: string,
    @Query(new ZodPipe(branchQuery)) q: z.infer<typeof branchQuery>,
  ) {
    return this.purchasing.unbilledReceipts(s, id, q.branchId);
  }

  @Get('supplier-bills')
  @RequirePermission('purchasing.read')
  @ApiQuery({ name: 'supplierId', required: false })
  @ApiQuery({ name: 'status', required: false, enum: ['open', 'all'] })
  @ApiOperation({
    operationId: 'listSupplierBills',
    summary: 'Bills by due date, with payables and goods received reconciled to the ledger',
  })
  @ApiOkResponse({ type: SupplierBillListDto })
  bills(
    @CurrentScope() s: CompanyScope,
    @Query(new ZodPipe(supplierBillListQuerySchema)) q: SupplierBillListQuery,
  ) {
    return this.purchasing.listBills(s, q);
  }

  @Post('supplier-bills')
  @RequirePermission('purchasing.read')
  @ApiOperation({
    operationId: 'createSupplierBill',
    summary: 'A supplier invoice for receipts; posts Dr goods received (+variance, input tax), Cr payables',
  })
  @ApiBody({ type: CreateSupplierBillDto })
  @ApiCreatedResponse({ type: SupplierBillDto })
  createBill(
    @CurrentScope() s: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Body(new ZodPipe(createSupplierBillSchema)) b: CreateSupplierBillInput,
    @RequestId() rid?: string,
  ) {
    return this.purchasing.createBill(s, p, b, ctxOf(p, rid));
  }

  @Get('supplier-bills/:billId')
  @RequirePermission('purchasing.read')
  @ApiParam({ name: 'billId', format: 'uuid' })
  @ApiOperation({ operationId: 'getSupplierBill' })
  @ApiOkResponse({ type: SupplierBillDto })
  bill(
    @CurrentScope() s: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('billId', id404) id: string,
  ) {
    return this.purchasing.getBill(s, p, id);
  }

  @Post('supplier-bills/:billId/payments')
  @RequirePermission('purchasing.read')
  @ApiParam({ name: 'billId', format: 'uuid' })
  @ApiOperation({ operationId: 'paySupplierBill', summary: 'Cash or bank transfer to the supplier' })
  @ApiBody({ type: SupplierPaymentInputDto })
  @ApiCreatedResponse({ type: SupplierBillDto })
  pay(
    @CurrentScope() s: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('billId', id404) id: string,
    @Body(new ZodPipe(supplierPaymentSchema)) b: SupplierPaymentInput,
    @RequestId() rid?: string,
  ) {
    return this.purchasing.pay(s, p, id, b, ctxOf(p, rid));
  }

  @Post('supplier-bills/:billId/cancel')
  @RequirePermission('purchasing.read')
  @ApiParam({ name: 'billId', format: 'uuid' })
  @ApiOperation({ operationId: 'cancelSupplierBill', summary: 'Cancel an unpaid bill (reversing journal)' })
  @ApiBody({ type: CancelSupplierBillDto })
  @ApiCreatedResponse({ type: SupplierBillDto })
  cancel(
    @CurrentScope() s: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('billId', id404) id: string,
    @Body(new ZodPipe(cancelSupplierBillSchema)) b: CancelSupplierBillInput,
    @RequestId() rid?: string,
  ) {
    return this.purchasing.cancel(s, p, id, b, ctxOf(p, rid));
  }
}
