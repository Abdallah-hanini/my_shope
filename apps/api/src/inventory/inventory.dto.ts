import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PartListItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() sku!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) nameAr!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) brand!: string | null;
  @ApiProperty({ enum: ['each', 'litre', 'kg', 'metre', 'set'] }) unit!: string;
  @ApiProperty() active!: boolean;
  @ApiProperty({
    example: '12.000',
    description: 'On hand in the branches the caller sees (or the chosen branch)',
  })
  onHand!: string;
  @ApiProperty({ example: '150.00' }) value!: string;
  @ApiPropertyOptional({ nullable: true, type: String, example: '12.5000' }) averageCost!: string | null;
}

export class BranchStockDto {
  @ApiProperty() branchId!: string;
  @ApiProperty() branchCode!: string;
  @ApiProperty() onHand!: string;
  @ApiProperty() value!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) averageCost!: string | null;
  @ApiProperty({ description: 'The caller may receive stock here' }) canReceive!: boolean;
  @ApiProperty({ description: 'The caller may adjust stock here' }) canAdjust!: boolean;
}

export class StockMovementDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'SM-2026-000001' }) number!: string;
  @ApiProperty() branchCode!: string;
  @ApiProperty({ enum: ['receipt', 'adjustment_in', 'adjustment_out'] }) kind!: string;
  @ApiProperty() quantity!: string;
  @ApiProperty() unitCost!: string;
  @ApiProperty() value!: string;
  @ApiProperty() onHandAfter!: string;
  @ApiProperty() valueAfter!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) reference!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) reason!: string | null;
  @ApiProperty() journalNumber!: string;
  @ApiProperty() createdByName!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class PartDto extends PartListItemDto {
  @ApiProperty() version!: number;
  @ApiProperty({ type: [BranchStockDto] }) branches!: BranchStockDto[];
  @ApiProperty({ type: [StockMovementDto], description: 'Newest first (up to 100)' })
  movements!: StockMovementDto[];
  @ApiProperty({ description: 'The caller may edit the catalogue entry' }) canEdit!: boolean;
}

export class PartListDto {
  @ApiProperty({ type: [PartListItemDto] }) parts!: PartListItemDto[];
  @ApiProperty({ description: 'The caller may add parts' }) canCreate!: boolean;
}

export class ValuationRowDto {
  @ApiProperty() partId!: string;
  @ApiProperty() sku!: string;
  @ApiProperty() name!: string;
  @ApiProperty() unit!: string;
  @ApiProperty() onHand!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) averageCost!: string | null;
  @ApiProperty() value!: string;
}
export class ValuationDto {
  @ApiPropertyOptional({ nullable: true, type: String }) branchId!: string | null;
  @ApiProperty({ format: 'date-time' }) asOf!: string;
  @ApiProperty() currency!: string;
  @ApiProperty({ type: [ValuationRowDto] }) rows!: ValuationRowDto[];
  @ApiProperty({ description: 'Σ stock value' }) totalValue!: string;
  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Inventory account balance in the ledger (same branches)',
  })
  ledgerBalance!: string | null;
  @ApiProperty({ description: 'Stock value equals the inventory account balance' }) reconciled!: boolean;
}

// Request bodies.
export class CreatePartDto {
  @ApiProperty() sku!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) nameAr?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) brand?: string | null;
  @ApiProperty({ enum: ['each', 'litre', 'kg', 'metre', 'set'] }) unit!: string;
}
export class UpdatePartDto {
  @ApiProperty() version!: number;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) nameAr?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) brand?: string | null;
  @ApiProperty() active!: boolean;
}
export class ReceiveStockDto {
  @ApiProperty() branchId!: string;
  @ApiProperty({ example: '10' }) quantity!: string;
  @ApiProperty({ example: '12.50' }) unitCost!: string;
  @ApiProperty({ description: 'Supplier delivery note or invoice number' }) reference!: string;
  @ApiProperty() idempotencyKey!: string;
}
export class AdjustStockDto {
  @ApiProperty() branchId!: string;
  @ApiProperty({ enum: ['in', 'out'] }) direction!: string;
  @ApiProperty() quantity!: string;
  @ApiPropertyOptional({ nullable: true, type: String, description: 'Required for found stock (in)' })
  unitCost?: string | null;
  @ApiProperty() reason!: string;
  @ApiProperty() idempotencyKey!: string;
}
