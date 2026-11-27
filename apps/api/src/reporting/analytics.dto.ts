import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Analytics reports (RPT R2). Money: strings with 2 decimals; percentages 1 decimal or null.

class RangeHead {
  @ApiProperty({ format: 'date' }) from!: string;
  @ApiProperty({ format: 'date' }) to!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) branchId!: string | null;
  @ApiProperty({ format: 'date-time', description: 'When the figures were read' }) asOf!: string;
}

export class SalesBranchDto {
  @ApiProperty() branchCode!: string;
  @ApiProperty() invoices!: number;
  @ApiProperty() sales!: string;
}
export class SalesMonthDto {
  @ApiProperty({ example: '2026-11' }) month!: string;
  @ApiProperty() sales!: string;
}
export class SalesItemDto {
  @ApiProperty() description!: string;
  @ApiProperty({ description: 'Parts: units; services: hours' }) quantity!: string;
  @ApiProperty({ description: 'Line amounts before the invoice discount' }) amount!: string;
}
export class SalesReportDto extends RangeHead {
  @ApiProperty() currency!: string;
  @ApiProperty() invoices!: number;
  @ApiProperty() creditNotes!: number;
  @ApiProperty({ description: 'Invoices less credit notes, excluding tax (= revenue posted by them)' })
  sales!: string;
  @ApiProperty() labourRevenue!: string;
  @ApiProperty() partsRevenue!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) partsSharePct!: string | null;
  @ApiProperty() discounts!: string;
  @ApiProperty() tax!: string;
  @ApiPropertyOptional({ nullable: true, type: String, description: 'Sales ÷ invoices not cancelled' })
  averageInvoice!: string | null;
  @ApiProperty({ description: 'All revenue accounts in the ledger for the period' }) ledgerRevenue!: string;
  @ApiProperty({ description: 'Ledger revenue not from invoices (e.g. manual journals)' })
  otherRevenue!: string;
  @ApiProperty({ type: [SalesBranchDto] }) byBranch!: SalesBranchDto[];
  @ApiProperty({ type: [SalesMonthDto] }) byMonth!: SalesMonthDto[];
  @ApiProperty({ type: [SalesItemDto] }) topParts!: SalesItemDto[];
  @ApiProperty({ type: [SalesItemDto] }) topServices!: SalesItemDto[];
}

export class OpenStatusDto {
  @ApiProperty() status!: string;
  @ApiProperty() count!: number;
  @ApiProperty({ description: 'Past their promised time' }) overdue!: number;
}
export class OperationsBranchDto {
  @ApiProperty() branchCode!: string;
  @ApiProperty() opened!: number;
  @ApiProperty() delivered!: number;
}
export class OperationsReportDto extends RangeHead {
  @ApiProperty({ description: 'Job cards opened in the period' }) opened!: number;
  @ApiProperty({ description: 'Of those, cancelled' }) cancelled!: number;
  @ApiProperty({ description: 'Delivered in the period' }) delivered!: number;
  @ApiPropertyOptional({ nullable: true, type: String, description: 'Delivered without rework' })
  firstTimeRightPct!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) averageHoursToDeliver!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) medianHoursToDeliver!: string | null;
  @ApiProperty({ description: 'Open now (not delivered or cancelled)' }) openNow!: number;
  @ApiProperty() overdueNow!: number;
  @ApiProperty({ type: [OpenStatusDto] }) openByStatus!: OpenStatusDto[];
  @ApiProperty({ type: [OperationsBranchDto] }) byBranch!: OperationsBranchDto[];
}

export class TopCustomerDto {
  @ApiProperty() customerId!: string;
  @ApiProperty() name!: string;
  @ApiProperty() invoices!: number;
  @ApiProperty() sales!: string;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'date' }) lastInvoiceDate!: string | null;
  @ApiProperty({ description: 'Also invoiced before the period' }) returning!: boolean;
}
export class CustomersReportDto extends RangeHead {
  @ApiProperty() currency!: string;
  @ApiProperty() totalCustomers!: number;
  @ApiProperty({ description: 'Customer records created in the period' }) newCustomers!: number;
  @ApiProperty({ description: 'Customers invoiced in the period' }) activeCustomers!: number;
  @ApiProperty({ description: 'Active customers also invoiced before the period' })
  returningCustomers!: number;
  @ApiPropertyOptional({ nullable: true, type: String }) returningPct!: string | null;
  @ApiProperty({ type: [TopCustomerDto] }) topCustomers!: TopCustomerDto[];
}

export class StockCountsDto {
  @ApiProperty() fast!: number;
  @ApiProperty() slow!: number;
  @ApiProperty() dead!: number;
}
export class StockPartDto {
  @ApiProperty() partId!: string;
  @ApiProperty() sku!: string;
  @ApiProperty() name!: string;
  @ApiProperty() unit!: string;
  @ApiProperty() openingQty!: string;
  @ApiProperty() receivedQty!: string;
  @ApiProperty({ description: 'Issued to jobs less returns' }) issuedQty!: string;
  @ApiProperty() closingQty!: string;
  @ApiProperty({ description: 'Cost of parts issued less returned' }) issuedValue!: string;
  @ApiProperty() closingValue!: string;
  @ApiPropertyOptional({ nullable: true, type: String, description: 'Issued value ÷ average stock value' })
  turnover!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'date' }) lastIssueDate!: string | null;
  @ApiProperty({ enum: ['fast', 'slow', 'dead', 'none'] }) class!: string;
}
export class StockMovementReportDto extends RangeHead {
  @ApiProperty() currency!: string;
  @ApiProperty() openingValue!: string;
  @ApiProperty() closingValue!: string;
  @ApiProperty() issuedValue!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) turnover!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String, description: 'Inventory account at the end date' })
  ledgerInventory!: string | null;
  @ApiProperty() reconciled!: boolean;
  @ApiProperty({ type: StockCountsDto }) counts!: StockCountsDto;
  @ApiProperty({ type: [StockPartDto], description: 'Largest issued value first' }) parts!: StockPartDto[];
}
