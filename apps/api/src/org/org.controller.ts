import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiParam,
} from '@nestjs/swagger';
import {
  createBranchSchema,
  createCompanySchema,
  type CreateBranchInput,
  type CreateCompanyInput,
} from '@erp/validation';
import {
  CurrentPrincipal,
  CurrentScope,
  PlatformAdminOnly,
  RequestId,
  RequirePermission,
} from '../auth/decorators';
import type { CompanyScope, Principal } from '../auth/principal';
import { ZodPipe } from '../common/zod.pipe';
import { BranchDto, CompanyDto, CreateBranchDto, CreateCompanyDto } from './org.dto';
import { OrgService } from './org.service';

@ApiTags('organization')
@ApiBearerAuth()
@Controller({ path: 'companies' })
export class OrgController {
  constructor(private readonly org: OrgService) {}

  @Post()
  @PlatformAdminOnly()
  @ApiOperation({
    operationId: 'createCompany',
    summary: 'Create a company with its administrator (platform admin)',
  })
  @ApiBody({ type: CreateCompanyDto })
  @ApiCreatedResponse({ type: CompanyDto })
  create(
    @Body(new ZodPipe(createCompanySchema)) body: CreateCompanyInput,
    @CurrentPrincipal() p: Principal,
    @RequestId() requestId?: string,
  ): Promise<CompanyDto> {
    return this.org.createCompany(body, { actorUserId: p.userId, requestId });
  }

  @Get()
  @ApiOperation({ operationId: 'listCompanies', summary: 'Companies where the caller holds a role' })
  @ApiOkResponse({ type: [CompanyDto] })
  list(@CurrentPrincipal() p: Principal): Promise<CompanyDto[]> {
    return this.org.listCompaniesFor(p.userId, p.isPlatformAdmin);
  }

  @Get(':companyId')
  @ApiParam({ name: 'companyId', format: 'uuid' })
  @ApiOperation({ operationId: 'getCompany', summary: 'Company header; any member of the company' })
  @ApiOkResponse({ type: CompanyDto })
  get(
    @CurrentPrincipal() p: Principal,
    @Param('companyId', new ParseUUIDPipe({ errorHttpStatusCode: 404 })) companyId: string,
  ): Promise<CompanyDto> {
    return this.org.getCompanyForMember(p.userId, p.isPlatformAdmin, companyId);
  }

  @Post(':companyId/branches')
  @ApiParam({ name: 'companyId', format: 'uuid' })
  @RequirePermission('org.branch.manage')
  @ApiOperation({ operationId: 'createBranch' })
  @ApiBody({ type: CreateBranchDto })
  @ApiCreatedResponse({ type: BranchDto })
  createBranch(
    @CurrentScope() scope: CompanyScope,
    @Body(new ZodPipe(createBranchSchema)) body: CreateBranchInput,
    @CurrentPrincipal() p: Principal,
    @RequestId() requestId?: string,
  ): Promise<BranchDto> {
    return this.org.createBranch(scope, body, { actorUserId: p.userId, requestId });
  }

  @Get(':companyId/branches')
  @ApiParam({ name: 'companyId', format: 'uuid' })
  @RequirePermission('org.branch.read')
  @ApiOperation({ operationId: 'listBranches', summary: 'Branches visible in the caller scope' })
  @ApiOkResponse({ type: [BranchDto] })
  listBranches(@CurrentScope() scope: CompanyScope): Promise<BranchDto[]> {
    return this.org.listBranches(scope);
  }
}
