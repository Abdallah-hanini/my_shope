import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({ description: 'Issuer (iss) of the OIDC provider' }) oidcIssuer!: string;
  @ApiProperty({ description: 'Subject (sub) of the user at that provider' }) oidcSubject!: string;
  @ApiProperty() email!: string;
  @ApiProperty() displayName!: string;
  @ApiPropertyOptional({ enum: ['en', 'ar'] }) locale?: 'en' | 'ar';
  @ApiPropertyOptional() isPlatformAdmin?: boolean;
}

export class UserDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ enum: ['en', 'ar'] }) locale!: string;
  @ApiProperty() isPlatformAdmin!: boolean;
  @ApiProperty({ enum: ['active', 'inactive'] }) status!: 'active' | 'inactive';
}

export class MeAssignmentDto {
  @ApiProperty() assignmentId!: string;
  @ApiProperty() roleCode!: string;
  @ApiPropertyOptional({ nullable: true, type: String, description: 'null = all branches' }) branchId!:
    | string
    | null;
}

export class MeCompanyDto {
  @ApiProperty() companyId!: string;
  @ApiProperty() code!: string;
  @ApiProperty() legalName!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) legalNameAr!: string | null;
  @ApiProperty({ type: [MeAssignmentDto] }) assignments!: MeAssignmentDto[];
  @ApiProperty({ type: [String], description: 'Union of permissions; scope still applies per branch' })
  permissions!: string[];
}

export class MeDto {
  @ApiProperty({ type: UserDto }) user!: UserDto;
  @ApiProperty({ type: [MeCompanyDto] }) companies!: MeCompanyDto[];
}

export class CreateRoleDto {
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional() nameAr?: string;
  @ApiProperty({ type: [String] }) permissions!: string[];
}

export class RoleDto {
  @ApiProperty() id!: string;
  @ApiProperty() companyId!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) nameAr!: string | null;
  @ApiProperty({ type: [String] }) permissions!: string[];
  @ApiProperty() isSystem!: boolean;
  @ApiProperty() version!: number;
  @ApiProperty({ description: 'Number of role assignments using this role' }) memberCount!: number;
}

export class UpdateRoleDto {
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) nameAr?: string | null;
  @ApiProperty({ type: [String] }) permissions!: string[];
  @ApiProperty({ description: 'Version you last read (optimistic lock)' }) version!: number;
}

export class CreateStaffDto {
  @ApiProperty({ example: 'ahmed.k' }) username!: string;
  @ApiProperty() email!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiPropertyOptional({ enum: ['en', 'ar'] }) locale?: 'en' | 'ar';
  @ApiProperty({ format: 'uuid' }) roleId!: string;
  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String, description: 'Omit for all branches' })
  branchId?: string | null;
  @ApiPropertyOptional({ description: 'Require an authenticator app at first sign-in (default true)' })
  requireOtp?: boolean;
}

export class StaffAssignmentDto {
  @ApiProperty() assignmentId!: string;
  @ApiProperty() roleId!: string;
  @ApiProperty() roleCode!: string;
  @ApiProperty() roleName!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) roleNameAr!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String, description: 'null = all branches' }) branchId!:
    | string
    | null;
}

export class StaffMemberDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ enum: ['active', 'inactive'] }) status!: 'active' | 'inactive';
  @ApiProperty() isPlatformAdmin!: boolean;
  @ApiProperty({ description: 'Also holds roles in other companies (managed by a platform administrator)' })
  inOtherCompanies!: boolean;
  @ApiProperty({ type: [StaffAssignmentDto] }) assignments!: StaffAssignmentDto[];
}

export class StaffCreatedDto {
  @ApiProperty({ type: StaffMemberDto }) user!: StaffMemberDto;
  @ApiProperty({ description: 'Shown once; the user must change it at first sign-in' })
  temporaryPassword!: string;
}

export class TemporaryPasswordDto {
  @ApiProperty({ description: 'Shown once; the user must change it at next sign-in' })
  temporaryPassword!: string;
}

export class SetUserStatusDto {
  @ApiProperty({ enum: ['active', 'inactive'] }) status!: 'active' | 'inactive';
  @ApiProperty() reason!: string;
}

export class CreateRoleAssignmentDto {
  @ApiProperty({ format: 'uuid' }) userId!: string;
  @ApiProperty({ format: 'uuid' }) roleId!: string;
  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String, description: 'Omit for all branches' })
  branchId?: string | null;
}

export class RoleAssignmentDto {
  @ApiProperty() id!: string;
  @ApiProperty() companyId!: string;
  @ApiProperty() userId!: string;
  @ApiProperty() roleId!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) branchId!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) grantedBy!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}
