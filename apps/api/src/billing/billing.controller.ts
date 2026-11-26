import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import {
  createInvoiceSchema,
  creditNoteSchema,
  postingSettingsSchema,
  recordPaymentSchema,
  releaseUnpaidSchema,
  type CreateInvoiceInput,
  type CreditNoteInput,
  type PostingSettingsInput,
  type RecordPaymentInput,
  type ReleaseUnpaidInput,
} from '@erp/validation';
import { CurrentPrincipal, CurrentScope, RequestId, RequirePermission } from '../auth/decorators';
import type { CompanyScope, Principal } from '../auth/principal';
import { ZodPipe } from '../common/zod.pipe';
import {
  CreateInvoiceDto,
  CreditNoteDto,
  InvoiceDto,
  JobBillingDto,
  PostingSettingsDto,
  RecordPaymentDto,
  ReleaseUnpaidDto,
  SetPostingSettingsDto,
} from './billing.dto';
import { BillingService } from './billing.service';

const id404 = new ParseUUIDPipe({ errorHttpStatusCode: 404 });
const ctxOf = (p: Principal, requestId?: string) => ({ actorUserId: p.userId, requestId });

/**
 * Invoices, payments and credit notes (T-72). Viewing: workshop.job.read. Invoicing and payments:
 * billing.invoice.manage. Unpaid release: workshop.pricing.manage. Posting accounts:
 * accounting.account.manage (company-wide). Checked by the service.
 */
@ApiTags('billing')
@ApiBearerAuth()
@ApiParam({ name: 'companyId', format: 'uuid' })
@Controller({ path: 'companies/:companyId' })
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('posting-settings')
  @RequirePermission('org.company.read')
  @ApiOperation({ operationId: 'getPostingSettings', summary: 'Accounts invoices and payments post to' })
  @ApiOkResponse({ type: PostingSettingsDto })
  posting(@CurrentScope() s: CompanyScope, @CurrentPrincipal() p: Principal) {
    return this.billing.postingSettings(s, p);
  }

  @Put('posting-settings')
  @RequirePermission('org.company.read')
  @ApiOperation({ operationId: 'setPostingSettings' })
  @ApiBody({ type: SetPostingSettingsDto })
  @ApiOkResponse({ type: PostingSettingsDto })
  setPosting(
    @CurrentScope() s: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Body(new ZodPipe(postingSettingsSchema)) b: PostingSettingsInput,
    @RequestId() rid?: string,
  ) {
    return this.billing.setPostingSettings(s, p, b, ctxOf(p, rid));
  }

  @Get('jobs/:jobId/billing')
  @RequirePermission('workshop.job.read')
  @ApiParam({ name: 'jobId', format: 'uuid' })
  @ApiOperation({
    operationId: 'getJobBilling',
    summary: 'Invoices, credit notes, payments and handover clearance',
  })
  @ApiOkResponse({ type: JobBillingDto })
  jobBilling(
    @CurrentScope() s: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('jobId', id404) jobId: string,
  ) {
    return this.billing.jobBilling(s, p, jobId);
  }

  @Post('jobs/:jobId/invoices')
  @RequirePermission('workshop.job.read')
  @ApiParam({ name: 'jobId', format: 'uuid' })
  @ApiOperation({
    operationId: 'createInvoice',
    summary: 'Invoice the approved quote and post it to the ledger',
  })
  @ApiBody({ type: CreateInvoiceDto })
  @ApiCreatedResponse({ type: JobBillingDto })
  createInvoice(
    @CurrentScope() s: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('jobId', id404) jobId: string,
    @Body(new ZodPipe(createInvoiceSchema)) b: CreateInvoiceInput,
    @RequestId() rid?: string,
  ) {
    return this.billing.createInvoice(s, p, jobId, b, ctxOf(p, rid));
  }

  @Get('invoices/:invoiceId')
  @RequirePermission('workshop.job.read')
  @ApiParam({ name: 'invoiceId', format: 'uuid' })
  @ApiOperation({ operationId: 'getInvoice' })
  @ApiOkResponse({ type: InvoiceDto })
  invoice(
    @CurrentScope() s: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('invoiceId', id404) id: string,
  ) {
    return this.billing.invoice(s, p, id);
  }

  @Post('invoices/:invoiceId/payments')
  @RequirePermission('workshop.job.read')
  @ApiParam({ name: 'invoiceId', format: 'uuid' })
  @ApiOperation({ operationId: 'recordPayment', summary: 'Cash, card or bank transfer against the invoice' })
  @ApiBody({ type: RecordPaymentDto })
  @ApiCreatedResponse({ type: JobBillingDto })
  pay(
    @CurrentScope() s: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('invoiceId', id404) id: string,
    @Body(new ZodPipe(recordPaymentSchema)) b: RecordPaymentInput,
    @RequestId() rid?: string,
  ) {
    return this.billing.recordPayment(s, p, id, b, ctxOf(p, rid));
  }

  @Post('invoices/:invoiceId/credit-note')
  @RequirePermission('workshop.job.read')
  @ApiParam({ name: 'invoiceId', format: 'uuid' })
  @ApiOperation({
    operationId: 'creditInvoice',
    summary: 'Cancel an unpaid invoice with a credit note (reversing journal)',
  })
  @ApiBody({ type: CreditNoteDto })
  @ApiCreatedResponse({ type: JobBillingDto })
  credit(
    @CurrentScope() s: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('invoiceId', id404) id: string,
    @Body(new ZodPipe(creditNoteSchema)) b: CreditNoteInput,
    @RequestId() rid?: string,
  ) {
    return this.billing.creditNote(s, p, id, b, ctxOf(p, rid));
  }

  @Post('jobs/:jobId/release-unpaid')
  @HttpCode(200)
  @RequirePermission('workshop.job.read')
  @ApiParam({ name: 'jobId', format: 'uuid' })
  @ApiOperation({
    operationId: 'releaseUnpaid',
    summary: 'The owner lets the car leave before the invoice is paid',
  })
  @ApiBody({ type: ReleaseUnpaidDto })
  @ApiOkResponse({ type: JobBillingDto })
  release(
    @CurrentScope() s: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('jobId', id404) jobId: string,
    @Body(new ZodPipe(releaseUnpaidSchema)) b: ReleaseUnpaidInput,
    @RequestId() rid?: string,
  ) {
    return this.billing.releaseUnpaid(s, p, jobId, b, ctxOf(p, rid));
  }
}
