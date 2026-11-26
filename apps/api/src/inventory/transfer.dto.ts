import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Stock transfers between branches (T-78).

export class TransferLineDto {
  @ApiProperty() lineNo!: number;
  @ApiProperty() partId!: string;
  @ApiProperty() sku!: string;
  @ApiProperty() partName!: string;
  @ApiProperty() unit!: string;
  @ApiProperty() quantity!: string;
  @ApiProperty({ description: 'Stock value sent (weighted average at the source)' }) value!: string;
  @ApiProperty() outNumber!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) inNumber!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) backNumber!: string | null;
}

export class TransferSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'ST-2026-000001' }) number!: string;
  @ApiProperty() fromBranchCode!: string;
  @ApiProperty() toBranchCode!: string;
  @ApiProperty({ enum: ['in_transit', 'received', 'cancelled'] }) status!: string;
  @ApiProperty() lineCount!: number;
  @ApiProperty() value!: string;
  @ApiProperty() dispatchedByName!: string;
  @ApiProperty({ format: 'date-time' }) dispatchedAt!: string;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' }) receivedAt!: string | null;
}

export class TransferDto extends TransferSummaryDto {
  @ApiPropertyOptional({ nullable: true, type: String }) note!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) receivedByName!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) cancelledByName!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' }) cancelledAt!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) cancelReason!: string | null;
  @ApiProperty({ type: [TransferLineDto] }) lines!: TransferLineDto[];
  @ApiProperty({ type: [String], enum: ['receive', 'cancel'], description: 'What the caller may do now' })
  actions!: string[];
}

export class BranchChoiceDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
}

export class TransferListDto {
  @ApiProperty({ type: [TransferSummaryDto], description: 'Newest first (up to 500)' })
  transfers!: TransferSummaryDto[];
  @ApiProperty({ type: [BranchChoiceDto], description: 'Branches the caller may send stock from' })
  fromBranches!: BranchChoiceDto[];
  @ApiProperty({ type: [BranchChoiceDto], description: 'Active branches of the company' })
  toBranches!: BranchChoiceDto[];
}

export class TransferLineInputDto {
  @ApiProperty() partId!: string;
  @ApiProperty({ example: '2' }) quantity!: string;
}
export class CreateTransferDto {
  @ApiProperty() fromBranchId!: string;
  @ApiProperty() toBranchId!: string;
  @ApiProperty({ type: [TransferLineInputDto] }) lines!: TransferLineInputDto[];
  @ApiPropertyOptional({ nullable: true, type: String }) note?: string | null;
  @ApiProperty() idempotencyKey!: string;
}
export class CancelTransferDto {
  @ApiProperty() reason!: string;
}
