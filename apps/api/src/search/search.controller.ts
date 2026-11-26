import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { searchQuerySchema, type SearchQuery } from '@erp/validation';
import { CurrentPrincipal } from '../auth/decorators';
import type { Principal } from '../auth/principal';
import { ZodPipe } from '../common/zod.pipe';
import { SearchResultDto } from './search.dto';
import { SearchService } from './search.service';

@ApiTags('search')
@ApiBearerAuth()
@Controller({ path: 'companies/:companyId/search' })
export class SearchController {
  constructor(private readonly search: SearchService) {}

  /** Any member may search; each record type is filtered by its own read permission and scope. */
  @Get()
  @ApiParam({ name: 'companyId', format: 'uuid' })
  @ApiOperation({
    operationId: 'search',
    summary: 'Find journals, accounts, branches, fiscal periods and people the caller may see',
  })
  @ApiQuery({ name: 'q', description: '2–100 characters; matched as "contains", Arabic variants unified' })
  @ApiQuery({ name: 'limit', required: false, description: 'Per record type, 1–20 (default 5)' })
  @ApiOkResponse({ type: SearchResultDto })
  run(
    @CurrentPrincipal() p: Principal,
    @Param('companyId', new ParseUUIDPipe({ errorHttpStatusCode: 404 })) companyId: string,
    @Query(new ZodPipe(searchQuerySchema)) q: SearchQuery,
  ): Promise<SearchResultDto> {
    return this.search.search(companyId, p, q);
  }
}
