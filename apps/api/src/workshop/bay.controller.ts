import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { createBaySchema, updateBaySchema, type CreateBayInput, type UpdateBayInput } from '@erp/validation';
import { CurrentPrincipal, CurrentScope, RequestId, RequirePermission } from '../auth/decorators';
import type { CompanyScope, Principal } from '../auth/principal';
import { ZodPipe } from '../common/zod.pipe';
import { BayBoardDto, CreateBayDto, UpdateBayDto } from './bay.dto';
import { BayService } from './bay.service';

const id404 = new ParseUUIDPipe({ errorHttpStatusCode: 404 });
const ctxOf = (p: Principal, requestId?: string) => ({ actorUserId: p.userId, requestId });

/** Bays and the bay board. Viewing needs workshop.job.read; setting up bays workshop.job.manage. */
@ApiTags('workshop')
@ApiBearerAuth()
@ApiParam({ name: 'companyId', format: 'uuid' })
@Controller({ path: 'companies/:companyId' })
export class BayController {
  constructor(private readonly bays: BayService) {}

  @Get('branches/:branchId/bays')
  @RequirePermission('workshop.job.read')
  @ApiParam({ name: 'branchId', format: 'uuid' })
  @ApiOperation({
    operationId: 'getBayBoard',
    summary: 'Bays with the car on each, and jobs waiting for a bay',
  })
  @ApiOkResponse({ type: BayBoardDto })
  board(
    @CurrentScope() scope: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('branchId', id404) branchId: string,
  ): Promise<BayBoardDto> {
    return this.bays.board(scope, p, branchId);
  }

  @Post('branches/:branchId/bays')
  @RequirePermission('workshop.job.read')
  @ApiParam({ name: 'branchId', format: 'uuid' })
  @ApiOperation({ operationId: 'createBay', summary: 'Add a bay (managers)' })
  @ApiBody({ type: CreateBayDto })
  @ApiCreatedResponse({ type: BayBoardDto })
  create(
    @CurrentScope() scope: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('branchId', id404) branchId: string,
    @Body(new ZodPipe(createBaySchema)) body: CreateBayInput,
    @RequestId() rid?: string,
  ): Promise<BayBoardDto> {
    return this.bays.create(scope, p, branchId, body, ctxOf(p, rid));
  }

  @Patch('bays/:bayId')
  @RequirePermission('workshop.job.read')
  @ApiParam({ name: 'bayId', format: 'uuid' })
  @ApiOperation({ operationId: 'updateBay', summary: 'Rename, deactivate or reactivate a bay (managers)' })
  @ApiBody({ type: UpdateBayDto })
  @ApiOkResponse({ type: BayBoardDto })
  update(
    @CurrentScope() scope: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('bayId', id404) bayId: string,
    @Body(new ZodPipe(updateBaySchema)) body: UpdateBayInput,
    @RequestId() rid?: string,
  ): Promise<BayBoardDto> {
    return this.bays.update(scope, p, bayId, body, ctxOf(p, rid));
  }
}
