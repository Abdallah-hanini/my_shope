import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
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
  quoteDecisionSchema,
  quoteVersionSchema,
  updateQuoteSchema,
  type QuoteDecisionInput,
  type QuoteVersionInput,
  type UpdateQuoteInput,
} from '@erp/validation';
import { CurrentPrincipal, CurrentScope, RequestId, RequirePermission } from '../auth/decorators';
import type { CompanyScope, Principal } from '../auth/principal';
import { ZodPipe } from '../common/zod.pipe';
import { JobQuotesDto, QuoteDecisionDto, QuoteVersionDto, UpdateQuoteDto } from './quote.dto';
import { QuoteService } from './quote.service';

const id404 = new ParseUUIDPipe({ errorHttpStatusCode: 404 });
const ctxOf = (p: Principal, requestId?: string) => ({ actorUserId: p.userId, requestId });

/**
 * Quotes on job cards (WMS-005). Viewing needs workshop.job.read; preparing, issuing and recording
 * the customer's decision workshop.job.manage; approving a discount above the managers' limit
 * workshop.pricing.manage (never one's own). Every response is the job's quotes.
 */
@ApiTags('workshop')
@ApiBearerAuth()
@ApiParam({ name: 'companyId', format: 'uuid' })
@Controller({ path: 'companies/:companyId' })
export class QuoteController {
  constructor(private readonly quotes: QuoteService) {}

  @Get('jobs/:jobId/quotes')
  @RequirePermission('workshop.job.read')
  @ApiParam({ name: 'jobId', format: 'uuid' })
  @ApiOperation({ operationId: 'getJobQuotes', summary: 'All quote revisions of a job, newest first' })
  @ApiOkResponse({ type: JobQuotesDto })
  list(
    @CurrentScope() s: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('jobId', id404) jobId: string,
  ) {
    return this.quotes.list(s, p, jobId);
  }

  @Post('jobs/:jobId/quotes')
  @RequirePermission('workshop.job.read')
  @ApiParam({ name: 'jobId', format: 'uuid' })
  @ApiOperation({
    operationId: 'createQuote',
    summary: 'Start a draft quote (the next revision) priced from the tasks',
  })
  @ApiCreatedResponse({ type: JobQuotesDto })
  create(
    @CurrentScope() s: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('jobId', id404) jobId: string,
    @RequestId() rid?: string,
  ) {
    return this.quotes.create(s, p, jobId, ctxOf(p, rid));
  }

  @Patch('quotes/:quoteId')
  @RequirePermission('workshop.job.read')
  @ApiParam({ name: 'quoteId', format: 'uuid' })
  @ApiOperation({
    operationId: 'updateQuote',
    summary: 'Draft: discount and per-task price changes (with reasons)',
  })
  @ApiBody({ type: UpdateQuoteDto })
  @ApiOkResponse({ type: JobQuotesDto })
  update(
    @CurrentScope() s: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('quoteId', id404) id: string,
    @Body(new ZodPipe(updateQuoteSchema)) b: UpdateQuoteInput,
    @RequestId() rid?: string,
  ) {
    return this.quotes.update(s, p, id, b, ctxOf(p, rid));
  }

  @Post('quotes/:quoteId/approve-discount')
  @HttpCode(200)
  @RequirePermission('workshop.job.read')
  @ApiParam({ name: 'quoteId', format: 'uuid' })
  @ApiOperation({
    operationId: 'approveQuoteDiscount',
    summary: 'Owner approves a discount above the managers’ limit',
  })
  @ApiBody({ type: QuoteVersionDto })
  @ApiOkResponse({ type: JobQuotesDto })
  approveDiscount(
    @CurrentScope() s: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('quoteId', id404) id: string,
    @Body(new ZodPipe(quoteVersionSchema)) b: QuoteVersionInput,
    @RequestId() rid?: string,
  ) {
    return this.quotes.approveDiscount(s, p, id, b, ctxOf(p, rid));
  }

  @Post('quotes/:quoteId/issue')
  @HttpCode(200)
  @RequirePermission('workshop.job.read')
  @ApiParam({ name: 'quoteId', format: 'uuid' })
  @ApiOperation({ operationId: 'issueQuote', summary: 'Number and freeze the draft for the customer' })
  @ApiBody({ type: QuoteVersionDto })
  @ApiOkResponse({ type: JobQuotesDto })
  issue(
    @CurrentScope() s: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('quoteId', id404) id: string,
    @Body(new ZodPipe(quoteVersionSchema)) b: QuoteVersionInput,
    @RequestId() rid?: string,
  ) {
    return this.quotes.issue(s, p, id, b, ctxOf(p, rid));
  }

  @Post('quotes/:quoteId/decision')
  @HttpCode(200)
  @RequirePermission('workshop.job.read')
  @ApiParam({ name: 'quoteId', format: 'uuid' })
  @ApiOperation({
    operationId: 'decideQuote',
    summary: 'Record the customer’s approval or refusal of an issued quote',
  })
  @ApiBody({ type: QuoteDecisionDto })
  @ApiOkResponse({ type: JobQuotesDto })
  decide(
    @CurrentScope() s: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('quoteId', id404) id: string,
    @Body(new ZodPipe(quoteDecisionSchema)) b: QuoteDecisionInput,
    @RequestId() rid?: string,
  ) {
    return this.quotes.decide(s, p, id, b, ctxOf(p, rid));
  }

  @Post('quotes/:quoteId/discard')
  @HttpCode(200)
  @RequirePermission('workshop.job.read')
  @ApiParam({ name: 'quoteId', format: 'uuid' })
  @ApiOperation({ operationId: 'discardQuote', summary: 'Delete a draft (issued quotes stay on record)' })
  @ApiBody({ type: QuoteVersionDto })
  @ApiOkResponse({ type: JobQuotesDto })
  discard(
    @CurrentScope() s: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('quoteId', id404) id: string,
    @Body(new ZodPipe(quoteVersionSchema)) b: QuoteVersionInput,
    @RequestId() rid?: string,
  ) {
    return this.quotes.discard(s, p, id, b, ctxOf(p, rid));
  }
}
