import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class JobPartDto {
  @ApiProperty() id!: string;
  @ApiProperty() partId!: string;
  @ApiProperty() sku!: string;
  @ApiProperty() name!: string;
  @ApiProperty() unit!: string;
  @ApiProperty({ example: '4.500' }) quantity!: string;
  @ApiProperty({ enum: ['ordered', 'reserved', 'issued', 'returned', 'released', 'cancelled'] })
  status!: string;
  @ApiPropertyOptional({ nullable: true, type: String, description: 'Stock value taken out (issued)' })
  cost!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String, description: 'Selling price per unit' }) salePrice!:
    | string
    | null;
  @ApiPropertyOptional({ nullable: true, type: String }) issueNumber!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) returnNumber!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time', description: 'Special order' })
  orderedAt!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) supplierName!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) orderRef!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' }) arrivedAt!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) cancelReason!: string | null;
  @ApiProperty({ type: [String], description: 'release, issue, return, allocate, cancelOrder' })
  actions!: string[];
}

export class SupplierRefDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
}

export class PartChoiceDto {
  @ApiProperty() partId!: string;
  @ApiProperty() sku!: string;
  @ApiProperty() name!: string;
  @ApiProperty() unit!: string;
  @ApiProperty({ description: 'On hand minus reserved at the job’s branch' }) available!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) salePrice!: string | null;
}

export class JobPartsDto {
  @ApiProperty() jobId!: string;
  @ApiProperty({ type: [JobPartDto] }) parts!: JobPartDto[];
  @ApiProperty({ description: 'The caller can reserve parts for this job now' }) canAdd!: boolean;
  @ApiProperty({
    type: [PartChoiceDto],
    description: 'Parts with stock available at the branch (when canAdd)',
  })
  choices!: PartChoiceDto[];
  @ApiProperty({ description: 'The caller can order parts for this job now (customer authorised)' })
  canOrder!: boolean;
  @ApiProperty({ type: [PartChoiceDto], description: 'Active parts with what is available (when canOrder)' })
  orderChoices!: PartChoiceDto[];
  @ApiProperty({ type: [SupplierRefDto], description: 'Active suppliers (when canOrder)' })
  suppliers!: SupplierRefDto[];
}

export class SpecialOrderDto {
  @ApiProperty() id!: string;
  @ApiProperty() jobId!: string;
  @ApiProperty() jobNumber!: string;
  @ApiProperty() jobStatus!: string;
  @ApiProperty() branchCode!: string;
  @ApiProperty() customerName!: string;
  @ApiProperty() plate!: string;
  @ApiProperty() partId!: string;
  @ApiProperty() sku!: string;
  @ApiProperty() partName!: string;
  @ApiProperty() unit!: string;
  @ApiProperty() quantity!: string;
  @ApiProperty({ enum: ['ordered', 'reserved', 'issued', 'returned', 'released', 'cancelled'] })
  status!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) supplierName!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) orderRef!: string | null;
  @ApiProperty({ format: 'date-time' }) orderedAt!: string;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' }) arrivedAt!: string | null;
  @ApiProperty({ description: 'Whole days from ordering to arrival (or until now)' }) daysWaiting!: number;
}

export class SpecialOrderListDto {
  @ApiProperty({ type: [SpecialOrderDto], description: 'Oldest first (up to 500)' })
  orders!: SpecialOrderDto[];
}

export class OrderJobPartDto {
  @ApiProperty() partId!: string;
  @ApiProperty({ example: '2' }) quantity!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) supplierId?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) orderRef?: string | null;
}
export class CancelOrderDto {
  @ApiProperty() reason!: string;
}

export class AddJobPartDto {
  @ApiProperty() partId!: string;
  @ApiProperty({ example: '4.5' }) quantity!: string;
}
export class JobPartStepDto {
  @ApiProperty({ description: 'A new UUID per form' }) idempotencyKey!: string;
}
