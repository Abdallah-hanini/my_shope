import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCompanyDto {
  @ApiProperty({ example: 'ACME' }) code!: string;
  @ApiProperty() legalName!: string;
  @ApiPropertyOptional() legalNameAr?: string;
  @ApiProperty({ example: 'QAR' }) baseCurrency!: string;
  @ApiProperty({ example: 'Asia/Qatar' }) timezone!: string;
  @ApiProperty({ format: 'uuid', description: 'Receives the company-admin role for all branches' })
  initialAdminUserId!: string;
}

export class CompanyDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() legalName!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) legalNameAr!: string | null;
  @ApiProperty() baseCurrency!: string;
  @ApiProperty() timezone!: string;
  @ApiProperty({ enum: ['active', 'inactive'] }) status!: 'active' | 'inactive';
  @ApiProperty() version!: number;
}

export class CreateBranchDto {
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional() nameAr?: string;
}

export class BranchDto {
  @ApiProperty() id!: string;
  @ApiProperty() companyId!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) nameAr!: string | null;
  @ApiProperty({ enum: ['active', 'inactive'] }) status!: 'active' | 'inactive';
  @ApiProperty() version!: number;
}
