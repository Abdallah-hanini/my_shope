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
