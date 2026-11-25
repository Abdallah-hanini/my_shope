import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'revenue', 'expense'];

export class CreateAccountDto {
  @ApiProperty({ example: '1100' }) code!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional() nameAr?: string;
  @ApiProperty({ enum: ACCOUNT_TYPES }) type!: string;
  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String }) parentId?: string | null;
  @ApiProperty({ description: 'false = header account (groups others, cannot be posted to)' })
  isPosting!: boolean;
}

export class AccountDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) nameAr!: string | null;
  @ApiProperty({ enum: ACCOUNT_TYPES }) type!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) parentId!: string | null;
  @ApiProperty() isPosting!: boolean;
  @ApiProperty({ enum: ['active', 'inactive'] }) status!: string;
  @ApiProperty() version!: number;
}

export class CreateFiscalPeriodDto {
  @ApiProperty({ example: '2026-01' }) name!: string;
  @ApiProperty({ format: 'date' }) startDate!: string;
  @ApiProperty({ format: 'date' }) endDate!: string;
}

export class CloseFiscalPeriodDto {
  @ApiProperty({ description: 'Version you last read (optimistic lock)' }) version!: number;
  @ApiProperty() reason!: string;
}

export class FiscalPeriodDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ format: 'date' }) startDate!: string;
  @ApiProperty({ format: 'date' }) endDate!: string;
  @ApiProperty({ enum: ['open', 'closed'] }) status!: string;
  @ApiPropertyOptional({ format: 'date-time', nullable: true, type: String }) closedAt!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) closedBy!: string | null;
  @ApiProperty() version!: number;
}

export class JournalLineInputDto {
  @ApiProperty({ format: 'uuid' }) accountId!: string;
  @ApiPropertyOptional({ example: '125.50', description: 'Decimal string; exactly one of debit/credit > 0' })
  debit?: string;
  @ApiPropertyOptional({ example: '0' }) credit?: string;
  @ApiPropertyOptional() description?: string;
}

export class PostJournalDto {
  @ApiProperty({ format: 'date' }) postingDate!: string;
  @ApiProperty() description!: string;
  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String }) branchId?: string | null;
  @ApiProperty({ type: [JournalLineInputDto], minItems: 2 }) lines!: JournalLineInputDto[];
}

export class ReverseJournalDto {
  @ApiProperty({ format: 'date' }) postingDate!: string;
  @ApiProperty() reason!: string;
}

export class JournalLineDto {
  @ApiProperty() lineNo!: number;
  @ApiProperty() accountId!: string;
  @ApiProperty() accountCode!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) description!: string | null;
  @ApiProperty({ example: '125.50' }) debit!: string;
  @ApiProperty({ example: '0.00' }) credit!: string;
}

export class JournalDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'JV-2026-000001' }) number!: string;
  @ApiProperty({ format: 'date' }) postingDate!: string;
  @ApiProperty() description!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) branchId!: string | null;
  @ApiProperty() fiscalPeriodId!: string;
  @ApiProperty() currency!: string;
  @ApiProperty() totalDebit!: string;
  @ApiProperty() totalCredit!: string;
  @ApiProperty({ enum: ['manual', 'reversal'] }) sourceType!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) reversalOfId!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) reversedById!: string | null;
  @ApiProperty() postedBy!: string;
  @ApiProperty({ format: 'date-time' }) postedAt!: string;
  @ApiProperty({ type: [JournalLineDto] }) lines!: JournalLineDto[];
}

export class JournalPageDto {
  @ApiProperty({ type: [JournalDto] }) items!: JournalDto[];
  @ApiPropertyOptional({ nullable: true, type: String }) nextCursor!: string | null;
}
