import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ReorderLevelBodyDto {
  @ApiProperty({ example: '4', description: 'Reorder point: low at or below this available quantity' })
  minQuantity!: string;
  @ApiProperty({ example: '12', description: 'Usual quantity to order' }) reorderQuantity!: string;
  @ApiPropertyOptional({ description: 'Required to change an existing level' }) version?: number;
}

export class ReorderLevelDto {
  @ApiProperty() partId!: string;
  @ApiProperty() branchId!: string;
  @ApiProperty() minQuantity!: string;
  @ApiProperty() reorderQuantity!: string;
  @ApiProperty() version!: number;
}

export class LowStockLineDto {
  @ApiProperty() partId!: string;
  @ApiProperty() sku!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) nameAr!: string | null;
  @ApiProperty() unit!: string;
  @ApiProperty() branchId!: string;
  @ApiProperty() branchCode!: string;
  @ApiProperty() onHand!: string;
  @ApiProperty({ description: 'Reserved for jobs' }) reserved!: string;
  @ApiProperty({ description: 'On hand − reserved' }) available!: string;
  @ApiProperty() minQuantity!: string;
  @ApiProperty() reorderQuantity!: string;
  @ApiProperty({ enum: ['out', 'low'] }) status!: string;
  @ApiProperty({ description: 'max(reorder quantity, minimum − available)' }) suggested!: string;
  @ApiPropertyOptional({ nullable: true, type: String, description: 'Branch weighted average' })
  averageCost!: string | null;
  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Suggested × average cost (null without a cost)',
  })
  suggestedValue!: string | null;
}

export class LowStockDto {
  @ApiPropertyOptional({ nullable: true, type: String }) branchId!: string | null;
  @ApiProperty() currency!: string;
  @ApiProperty({ description: 'Part-and-branch pairs with a reorder point in scope' }) levelsSet!: number;
  @ApiProperty() outCount!: number;
  @ApiProperty() lowCount!: number;
  @ApiProperty({ description: 'Sum of suggestedValue where known' }) suggestedValue!: string;
  @ApiProperty({ type: [LowStockLineDto], description: 'Out of stock first, then by SKU' })
  lines!: LowStockLineDto[];
  @ApiProperty({ format: 'date-time' }) asOf!: string;
}

export class SalesTargetBodyDto {
  @ApiProperty({ example: '2026-11' }) month!: string;
  @ApiPropertyOptional({ nullable: true, type: String, description: 'Empty: the whole company' })
  branchId?: string | null;
  @ApiProperty({ example: '50000.00', description: 'Sales excluding tax' }) amount!: string;
  @ApiPropertyOptional({ description: 'Required to change an existing target' }) version?: number;
}

export class SalesTargetDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: '2026-11' }) month!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) branchId!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) branchCode!: string | null;
  @ApiProperty() amount!: string;
  @ApiProperty() version!: number;
}

export class TargetMonthDto {
  @ApiProperty({ example: '2026-11' }) month!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) target!: string | null;
  @ApiProperty({ description: 'Sales excluding tax (as the sales report)' }) actual!: string;
  @ApiPropertyOptional({ nullable: true, type: String, description: 'actual ÷ target × 100' })
  achievementPct!: string | null;
}

export class TargetPaceDto {
  @ApiProperty({ example: '2026-11' }) month!: string;
  @ApiProperty() day!: number;
  @ApiProperty() days!: number;
  @ApiProperty() target!: string;
  @ApiProperty({ description: 'target × day ÷ days' }) expected!: string;
  @ApiProperty() actual!: string;
  @ApiProperty() behind!: boolean;
}

export class TargetsReportDto {
  @ApiProperty() year!: number;
  @ApiPropertyOptional({ nullable: true, type: String, description: 'Empty: the whole company' })
  branchId!: string | null;
  @ApiProperty() currency!: string;
  @ApiProperty({ type: [TargetMonthDto] }) months!: TargetMonthDto[];
  @ApiProperty() targetTotal!: string;
  @ApiProperty({ description: 'Actual sales in months that have a target' }) actualOfTargeted!: string;
  @ApiPropertyOptional({
    nullable: true,
    type: TargetPaceDto,
    description: 'This month, when it has a target',
  })
  pace!: TargetPaceDto | null;
  @ApiProperty({ type: [SalesTargetDto], description: 'Targets of the year the caller can see' })
  targets!: SalesTargetDto[];
  @ApiProperty({ description: 'The caller may set targets (for the whole company or some branch)' })
  canManage!: boolean;
  @ApiProperty({ format: 'date-time' }) asOf!: string;
}

export class AlertDto {
  @ApiProperty({
    enum: [
      'stock_out',
      'stock_low',
      'receivables_overdue',
      'payables_overdue',
      'receivables_unreconciled',
      'payables_unreconciled',
      'sales_behind_target',
      'negative_gross_margin',
    ],
  })
  key!: string;
  @ApiProperty({ enum: ['danger', 'warning'] }) severity!: string;
  @ApiPropertyOptional({ nullable: true, type: Number }) count!: number | null;
  @ApiPropertyOptional({ nullable: true, type: String }) amount!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String, description: 'Sales target pace: expected by now' })
  expected!: string | null;
  @ApiProperty({ example: 'reports/low-stock', description: 'Page under the company that explains it' })
  href!: string;
}

export class AlertsDto {
  @ApiProperty() currency!: string;
  @ApiProperty({ type: [AlertDto], description: 'Danger first' }) alerts!: AlertDto[];
  @ApiProperty({ description: 'Overdue receivables threshold in days' }) overdueDays!: number;
  @ApiProperty({ format: 'date-time' }) asOf!: string;
}
