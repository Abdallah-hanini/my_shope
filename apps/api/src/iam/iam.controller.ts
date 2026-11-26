import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
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
  createStaffSchema,
  createUserSchema,
  setUserStatusSchema,
  updateRoleSchema,
  type CreateRoleAssignmentInput,
  type CreateRoleInput,
  type CreateStaffInput,
  type CreateUserInput,
  type SetUserStatusInput,
  type UpdateRoleInput,
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
  CreateStaffDto,
  CreateUserDto,
  MeDto,
  RoleAssignmentDto,
  RoleDto,
  SetUserStatusDto,
  StaffCreatedDto,
  StaffMemberDto,
  TemporaryPasswordDto,
  UpdateRoleDto,
  UserDto,
} from './iam.dto';
import { IamService } from './iam.service';
import { StaffService } from './staff.service';

@ApiTags('identity')
@ApiBearerAuth()
@Controller()
export class IamController {
  constructor(
    private readonly iam: IamService,
    private readonly staff: StaffService,
  ) {}

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

  @Patch('companies/:companyId/roles/:roleId')
  @ApiParam({ name: 'companyId', format: 'uuid' })
  @RequirePermission('iam.role.manage')
  @ApiOperation({
    operationId: 'updateRole',
    summary: 'Rename a role and change its permissions (not system roles)',
  })
  @ApiBody({ type: UpdateRoleDto })
  @ApiOkResponse({ type: RoleDto })
  updateRole(
    @CurrentScope() scope: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('roleId', new ParseUUIDPipe()) roleId: string,
    @Body(new ZodPipe(updateRoleSchema)) body: UpdateRoleInput,
    @RequestId() requestId?: string,
  ): Promise<RoleDto> {
    return this.iam.updateRole(scope, p, roleId, body, { actorUserId: p.userId, requestId });
  }

  @Delete('companies/:companyId/roles/:roleId')
  @HttpCode(204)
  @ApiParam({ name: 'companyId', format: 'uuid' })
  @RequirePermission('iam.role.manage')
  @ApiOperation({ operationId: 'deleteRole', summary: 'Delete an unused, non-system role' })
  @ApiNoContentResponse()
  deleteRole(
    @CurrentScope() scope: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('roleId', new ParseUUIDPipe()) roleId: string,
    @RequestId() requestId?: string,
  ): Promise<void> {
    return this.iam.deleteRole(scope, p, roleId, { actorUserId: p.userId, requestId });
  }

  @Get('companies/:companyId/users')
  @ApiParam({ name: 'companyId', format: 'uuid' })
  @RequirePermission('iam.assignment.read')
  @ApiOperation({
    operationId: 'listStaff',
    summary: 'People holding roles in this company (within your branch scope)',
  })
  @ApiOkResponse({ type: [StaffMemberDto] })
  listStaff(@CurrentScope() scope: CompanyScope): Promise<StaffMemberDto[]> {
    return this.staff.list(scope);
  }

  @Get('companies/:companyId/users/:userId')
  @ApiParam({ name: 'companyId', format: 'uuid' })
  @RequirePermission('iam.assignment.read')
  @ApiOperation({ operationId: 'getStaffMember' })
  @ApiOkResponse({ type: StaffMemberDto })
  getStaff(
    @CurrentScope() scope: CompanyScope,
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ): Promise<StaffMemberDto> {
    return this.staff.get(scope, userId);
  }

  @Post('companies/:companyId/users')
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'companyId', format: 'uuid' })
  @RequirePermission('iam.user.manage')
  @ApiOperation({
    operationId: 'createStaff',
    summary: 'Create a sign-in account and give it a role (temporary password returned once)',
  })
  @ApiBody({ type: CreateStaffDto })
  @ApiCreatedResponse({ type: StaffCreatedDto })
  createStaff(
    @CurrentScope() scope: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Body(new ZodPipe(createStaffSchema)) body: CreateStaffInput,
    @RequestId() requestId?: string,
  ): Promise<StaffCreatedDto> {
    return this.staff.create(scope, p, body, { actorUserId: p.userId, requestId });
  }

  @Post('companies/:companyId/users/:userId/reset-password')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'companyId', format: 'uuid' })
  @RequirePermission('iam.user.manage')
  @ApiOperation({
    operationId: 'resetStaffPassword',
    summary: 'Issue a temporary password and end the user’s sessions',
  })
  @ApiOkResponse({ type: TemporaryPasswordDto })
  resetPassword(
    @CurrentScope() scope: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @RequestId() requestId?: string,
  ): Promise<TemporaryPasswordDto> {
    return this.staff.resetPassword(scope, p, userId, { actorUserId: p.userId, requestId });
  }

  @Post('companies/:companyId/users/:userId/status')
  @HttpCode(200)
  @ApiParam({ name: 'companyId', format: 'uuid' })
  @RequirePermission('iam.user.manage')
  @ApiOperation({
    operationId: 'setStaffStatus',
    summary: 'Deactivate (blocks sign-in immediately) or reactivate',
  })
  @ApiBody({ type: SetUserStatusDto })
  @ApiOkResponse({ type: StaffMemberDto })
  setStatus(
    @CurrentScope() scope: CompanyScope,
    @CurrentPrincipal() p: Principal,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body(new ZodPipe(setUserStatusSchema)) body: SetUserStatusInput,
    @RequestId() requestId?: string,
  ): Promise<StaffMemberDto> {
    return this.staff.setStatus(scope, p, userId, body, { actorUserId: p.userId, requestId });
  }
}
