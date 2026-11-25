import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import {
  closeFiscalPeriodSchema,
  createAccountSchema,
  createFiscalPeriodSchema,
  IDEMPOTENCY_KEY_PATTERN,
  listQuerySchema,
  postJournalSchema,
  reverseJournalSchema,
  type CloseFiscalPeriodInput,
  type CreateAccountInput,
  type CreateFiscalPeriodInput,
  type ListQuery,
  type PostJournalInput,
  type ReverseJournalInput,
} from '@erp/validation';
import { CurrentPrincipal, CurrentScope, RequestId, RequirePermission } from '../auth/decorators';
import type { CompanyScope, Principal } from '../auth/principal';
import { badRequest } from '../common/errors';
import { ZodPipe } from '../common/zod.pipe';
import {
  AccountDto,
  CloseFiscalPeriodDto,
  CreateAccountDto,
  CreateFiscalPeriodDto,
  FiscalPeriodDto,
  JournalDto,
  JournalPageDto,
  PostJournalDto,
  ReverseJournalDto,
} from './accounting.dto';
import { AccountingService } from './accounting.service';
import { JournalService, type PostResult } from './journal.service';

const idempotencyHeader = {
  name: 'Idempotency-Key',
  required: true,
  description:
    '8–128 chars [A-Za-z0-9_.:-]. Retrying with the same key and body returns the original journal.',
};

function requireIdempotencyKey(key: string | undefined): string {
  if (!key || !IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw badRequest('Idempotency-Key header is required (8–128 characters: letters, digits, _ . : -)');
  }
  return key;
}

function respond(res: Response, r: PostResult): JournalDto {
  res.status(r.replayed ? 200 : 201);
  if (r.replayed) res.setHeader('Idempotent-Replayed', 'true');
  return r.journal;
}

@ApiTags('accounting')
@ApiBearerAuth()
@Controller({ path: 'companies/:companyId' })
export class AccountingController {
  constructor(
    private readonly accounting: AccountingService,
    private readonly journals: JournalService,
  ) {}

  @Post('accounts')
  @RequirePermission('accounting.account.manage')
  @ApiOperation({ operationId: 'createAccount' })
  @ApiBody({ type: CreateAccountDto })
  @ApiCreatedResponse({ type: AccountDto })
  createAccount(
    @CurrentScope() scope: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Body(new ZodPipe(createAccountSchema)) body: CreateAccountInput,
    @RequestId() requestId?: string,
  ): Promise<AccountDto> {
    return this.accounting.createAccount(scope, body, { actorUserId: p.userId, requestId });
  }

  @Get('accounts')
  @RequirePermission('accounting.account.read')
  @ApiOperation({ operationId: 'listAccounts', summary: 'Chart of accounts ordered by code' })
  @ApiOkResponse({ type: [AccountDto] })
  listAccounts(@CurrentScope() scope: CompanyScope): Promise<AccountDto[]> {
    return this.accounting.listAccounts(scope);
  }

  @Post('fiscal-periods')
  @RequirePermission('accounting.period.manage')
  @ApiOperation({ operationId: 'createFiscalPeriod' })
  @ApiBody({ type: CreateFiscalPeriodDto })
  @ApiCreatedResponse({ type: FiscalPeriodDto })
  createPeriod(
    @CurrentScope() scope: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Body(new ZodPipe(createFiscalPeriodSchema)) body: CreateFiscalPeriodInput,
    @RequestId() requestId?: string,
  ): Promise<FiscalPeriodDto> {
    return this.accounting.createPeriod(scope, body, { actorUserId: p.userId, requestId });
  }

  @Get('fiscal-periods')
  @RequirePermission('accounting.period.read')
  @ApiOperation({ operationId: 'listFiscalPeriods' })
  @ApiOkResponse({ type: [FiscalPeriodDto] })
  listPeriods(@CurrentScope() scope: CompanyScope): Promise<FiscalPeriodDto[]> {
    return this.accounting.listPeriods(scope);
  }

  @Post('fiscal-periods/:periodId/close')
  @HttpCode(200)
  @RequirePermission('accounting.period.manage')
  @ApiOperation({
    operationId: 'closeFiscalPeriod',
    summary: 'Close a period; later postings into it are rejected',
  })
  @ApiBody({ type: CloseFiscalPeriodDto })
  @ApiOkResponse({ type: FiscalPeriodDto })
  closePeriod(
    @CurrentScope() scope: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('periodId', new ParseUUIDPipe()) periodId: string,
    @Body(new ZodPipe(closeFiscalPeriodSchema)) body: CloseFiscalPeriodInput,
    @RequestId() requestId?: string,
  ): Promise<FiscalPeriodDto> {
    return this.accounting.closePeriod(scope, periodId, body, { actorUserId: p.userId, requestId });
  }

  @Post('journals')
  @RequirePermission('accounting.journal.post')
  @ApiOperation({
    operationId: 'postJournal',
    summary: 'Post a balanced manual journal (immutable once posted)',
  })
  @ApiHeader(idempotencyHeader)
  @ApiBody({ type: PostJournalDto })
  @ApiCreatedResponse({ type: JournalDto })
  @ApiOkResponse({
    type: JournalDto,
    description: 'Replay of an earlier request with the same Idempotency-Key',
  })
  async postJournal(
    @CurrentScope() scope: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Headers('idempotency-key') key: string | undefined,
    @Body(new ZodPipe(postJournalSchema)) body: PostJournalInput,
    @Res({ passthrough: true }) res: Response,
    @RequestId() requestId?: string,
  ): Promise<JournalDto> {
    const r = await this.journals.post(scope, body, requireIdempotencyKey(key), {
      actorUserId: p.userId,
      requestId,
    });
    return respond(res, r);
  }

  @Get('journals')
  @RequirePermission('accounting.journal.read')
  @ApiOperation({ operationId: 'listJournals', summary: 'Journals newest first (cursor pagination)' })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkResponse({ type: JournalPageDto })
  listJournals(
    @CurrentScope() scope: CompanyScope,
    @Query(new ZodPipe(listQuerySchema)) q: ListQuery,
  ): Promise<JournalPageDto> {
    return this.journals.list(scope, q);
  }

  @Get('journals/:journalId')
  @RequirePermission('accounting.journal.read')
  @ApiOperation({ operationId: 'getJournal' })
  @ApiOkResponse({ type: JournalDto })
  getJournal(
    @CurrentScope() scope: CompanyScope,
    @Param('journalId', new ParseUUIDPipe()) journalId: string,
  ): Promise<JournalDto> {
    return this.journals.get(scope, journalId);
  }

  @Post('journals/:journalId/reverse')
  @RequirePermission('accounting.journal.reverse')
  @ApiOperation({
    operationId: 'reverseJournal',
    summary: 'Post the mirror-image journal; the original is unchanged',
  })
  @ApiHeader(idempotencyHeader)
  @ApiBody({ type: ReverseJournalDto })
  @ApiCreatedResponse({ type: JournalDto })
  @ApiOkResponse({
    type: JournalDto,
    description: 'Replay of an earlier request with the same Idempotency-Key',
  })
  async reverse(
    @CurrentScope() scope: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('journalId', new ParseUUIDPipe()) journalId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body(new ZodPipe(reverseJournalSchema)) body: ReverseJournalInput,
    @Res({ passthrough: true }) res: Response,
    @RequestId() requestId?: string,
  ): Promise<JournalDto> {
    const r = await this.journals.reverse(scope, journalId, body, requireIdempotencyKey(key), {
      actorUserId: p.userId,
      requestId,
    });
    return respond(res, r);
  }
}
