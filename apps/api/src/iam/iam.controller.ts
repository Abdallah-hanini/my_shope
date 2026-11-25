import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiParam,
} from '@nestjs/swagger';
import {
  createRoleAssignmentSchema,
  createRoleSchema,
  createUserSchema,
  type CreateRoleAssignmentInput,
  type CreateRoleInput,
  type CreateUserInput,
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
import {
  CreateRoleAssignmentDto,
  CreateRoleDto,
  CreateUserDto,
  MeDto,
  RoleAssignmentDto,
  RoleDto,
  UserDto,
} from './iam.dto';
import { IamService } from './iam.service';

@ApiTags('identity')
@ApiBearerAuth()
@Controller()
export class IamController {
  constructor(private readonly iam: IamService) {}

  @Get('me')
  @ApiOperation({ operationId: 'getMe', summary: 'Caller profile, companies, roles and permissions' })
  @ApiOkResponse({ type: MeDto })
  me(@CurrentPrincipal() p: Principal): Promise<MeDto> {
    return this.iam.me(p);
  }

  @Post('users')
  @PlatformAdminOnly()
  @ApiOperation({
    operationId: 'createUser',
    summary: 'Provision a user from an OIDC identity (platform admin)',
  })
  @ApiBody({ type: CreateUserDto })
  @ApiCreatedResponse({ type: UserDto })
  createUser(
    @Body(new ZodPipe(createUserSchema)) body: CreateUserInput,
    @CurrentPrincipal() p: Principal,
    @RequestId() requestId?: string,
  ): Promise<UserDto> {
    return this.iam.createUser(body, { actorUserId: p.userId, requestId });
  }

  @Post('companies/:companyId/roles')
  @ApiParam({ name: 'companyId', format: 'uuid' })
  @RequirePermission('iam.role.manage')
  @ApiOperation({ operationId: 'createRole' })
  @ApiBody({ type: CreateRoleDto })
  @ApiCreatedResponse({ type: RoleDto })
  createRole(
    @CurrentScope() scope: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Body(new ZodPipe(createRoleSchema)) body: CreateRoleInput,
    @RequestId() requestId?: string,
  ): Promise<RoleDto> {
    return this.iam.createRole(scope, p, body, { actorUserId: p.userId, requestId });
  }

  @Get('companies/:companyId/roles')
  @ApiParam({ name: 'companyId', format: 'uuid' })
  @RequirePermission('iam.role.read')
  @ApiOperation({ operationId: 'listRoles' })
  @ApiOkResponse({ type: [RoleDto] })
  listRoles(@CurrentScope() scope: CompanyScope): Promise<RoleDto[]> {
    return this.iam.listRoles(scope);
  }

  @Post('companies/:companyId/role-assignments')
  @ApiParam({ name: 'companyId', format: 'uuid' })
  @RequirePermission('iam.assignment.manage')
  @ApiOperation({
    operationId: 'createRoleAssignment',
    summary: 'Grant a role, company-wide or for one branch',
  })
  @ApiBody({ type: CreateRoleAssignmentDto })
  @ApiCreatedResponse({ type: RoleAssignmentDto })
  assign(
    @CurrentScope() scope: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Body(new ZodPipe(createRoleAssignmentSchema)) body: CreateRoleAssignmentInput,
    @RequestId() requestId?: string,
  ): Promise<RoleAssignmentDto> {
    return this.iam.assign(scope, p, body, { actorUserId: p.userId, requestId });
  }

  @Get('companies/:companyId/role-assignments')
  @ApiParam({ name: 'companyId', format: 'uuid' })
  @RequirePermission('iam.assignment.read')
  @ApiOperation({ operationId: 'listRoleAssignments' })
  @ApiOkResponse({ type: [RoleAssignmentDto] })
  listAssignments(@CurrentScope() scope: CompanyScope): Promise<RoleAssignmentDto[]> {
    return this.iam.listAssignments(scope);
  }

  @Delete('companies/:companyId/role-assignments/:assignmentId')
  @ApiParam({ name: 'companyId', format: 'uuid' })
  @HttpCode(204)
  @RequirePermission('iam.assignment.manage')
  @ApiOperation({ operationId: 'revokeRoleAssignment' })
  @ApiNoContentResponse()
  revoke(
    @CurrentScope() scope: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('assignmentId', new ParseUUIDPipe()) assignmentId: string,
    @RequestId() requestId?: string,
  ): Promise<void> {
    return this.iam.revoke(scope, p, assignmentId, { actorUserId: p.userId, requestId });
  }
}
