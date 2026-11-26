import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DatedRateDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: '5.0000', description: 'Percent (tax) or amount per hour (labour)' })
  value!: string;
  @ApiProperty({ example: '2027-01-01' }) effectiveFrom!: string;
  @ApiProperty({ description: 'Not started yet, so it may still be removed' }) canRemove!: boolean;
}

export class AccountRefDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
}

export class TaxCodeDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'VAT-STD' }) code!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) nameAr!: string | null;
  @ApiProperty() active!: boolean;
  @ApiPropertyOptional({ nullable: true, type: AccountRefDto }) outputAccount!: AccountRefDto | null;
  @ApiPropertyOptional({ nullable: true, type: String, description: 'Rate in force today (percent)' })
  currentRatePct!: string | null;
  @ApiProperty({ type: [DatedRateDto], description: 'Newest first' }) rates!: DatedRateDto[];
  @ApiProperty() version!: number;
}

export class TaxSetupDto {
  @ApiProperty({ example: '2026-11-28', description: "Today in the company's time zone" }) today!: string;
  @ApiProperty() pricesIncludeTax!: boolean;
  @ApiPropertyOptional({ nullable: true, type: String, description: 'null = no tax on sales' })
  defaultTaxCodeId!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) taxRegistrationNo!: string | null;
  @ApiProperty({ description: '0 until the settings are first saved' }) version!: number;
  @ApiProperty({ type: [TaxCodeDto] }) codes!: TaxCodeDto[];
  @ApiProperty({ description: 'The caller may change the tax set-up (accounting.tax.manage)' })
  canManage!: boolean;
}

export class BranchLabourDto {
  @ApiProperty() branchId!: string;
  @ApiProperty() branchCode!: string;
  @ApiProperty() branchName!: string;
  @ApiPropertyOptional({ nullable: true, type: String, description: 'Rate per hour in force today' })
  currentRate!: string | null;
  @ApiProperty({ type: [DatedRateDto], description: 'Newest first' }) rates!: DatedRateDto[];
  @ApiProperty({ description: 'The caller may change this branch’s rates' }) canManage!: boolean;
}

export class PricingDto {
  @ApiProperty({ example: '2026-11-28' }) today!: string;
  @ApiProperty({ example: 'QAR' }) currency!: string;
  @ApiProperty({ example: '10.0000' }) managerDiscountLimitPct!: string;
  @ApiProperty({ description: '0 until first saved' }) version!: number;
  @ApiProperty({ type: [BranchLabourDto] }) branches!: BranchLabourDto[];
  @ApiProperty({ description: 'The caller may change the discount limit' }) canManageSettings!: boolean;
}

export class CompanyProfileDto {
  @ApiProperty() legalName!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) legalNameAr!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) crNumber!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) address!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) addressAr!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) phone!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String, description: 'Changes when the logo changes' })
  logoVersion!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) taxRegistrationNo!: string | null;
  @ApiProperty() version!: number;
  @ApiProperty() canManage!: boolean;
}

// Request bodies (validated by the shared Zod schemas; these document them).
export class CreateTaxCodeDto {
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) nameAr?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) outputAccountId?: string | null;
}
export class UpdateTaxCodeDto {
  @ApiProperty() version!: number;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) nameAr?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) outputAccountId?: string | null;
  @ApiProperty() active!: boolean;
}
export class AddTaxRateDto {
  @ApiProperty({ example: '5' }) rate!: string;
  @ApiProperty({ example: '2027-01-01' }) effectiveFrom!: string;
}
export class TaxSettingsDto {
  @ApiProperty() version!: number;
  @ApiProperty() pricesIncludeTax!: boolean;
  @ApiPropertyOptional({ nullable: true, type: String }) defaultTaxCodeId!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) taxRegistrationNo?: string | null;
}
export class AddLabourRateDto {
  @ApiProperty({ example: '150' }) rate!: string;
  @ApiProperty({ example: '2027-01-01' }) effectiveFrom!: string;
}
export class PricingSettingsDto {
  @ApiProperty() version!: number;
  @ApiProperty({ example: '10' }) managerDiscountLimitPct!: string;
}
export class UpdateCompanyProfileDto {
  @ApiProperty() version!: number;
  @ApiPropertyOptional({ nullable: true, type: String }) crNumber?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) address?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) addressAr?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) phone?: string | null;
}
