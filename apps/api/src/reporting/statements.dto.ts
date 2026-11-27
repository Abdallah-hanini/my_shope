import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Financial statements and aging (RPT). Money: strings with 2 decimals; percentages 1 decimal.

export class StatementLineDto {
  @ApiProperty() accountId!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) nameAr!: string | null;
  @ApiProperty({ example: '1500.00' }) amount!: string;
  @ApiPropertyOptional({ nullable: true, type: String, description: 'Comparison period' }) previous!:
    | string
    | null;
  @ApiPropertyOptional({ nullable: true, type: String, description: 'Null when the base is zero' })
  changePct!: string | null;
}

export class StatementSectionDto {
  @ApiProperty() key!: string;
  @ApiProperty({ type: [StatementLineDto] }) lines!: StatementLineDto[];
  @ApiProperty() total!: string;
  @ApiPropertyOptional({ nullable: true, type: String, description: 'Comparison period total' })
  previousTotal!: string | null;
}

export class FigureDto {
  @ApiProperty() amount!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) previous!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) changePct!: string | null;
}

export class ProfitAndLossDto {
  @ApiProperty({ format: 'date' }) from!: string;
  @ApiProperty({ format: 'date' }) to!: string;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'date' }) previousFrom!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'date' }) previousTo!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) branchId!: string | null;
  @ApiProperty() currency!: string;
  @ApiProperty({ type: StatementSectionDto }) revenue!: StatementSectionDto;
  @ApiProperty({ type: StatementSectionDto, description: 'Expense accounts classed as COGS' })
  costOfSales!: StatementSectionDto;
  @ApiProperty({ type: StatementSectionDto }) operatingExpenses!: StatementSectionDto;
  @ApiProperty({ type: FigureDto }) grossProfit!: FigureDto;
  @ApiProperty({ type: FigureDto }) netProfit!: FigureDto;
  @ApiPropertyOptional({ nullable: true, type: String }) grossMarginPct!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) previousGrossMarginPct!: string | null;
  @ApiProperty({ format: 'date-time', description: 'When the figures were read' }) asOf!: string;
}

export class BalanceSheetDto {
  @ApiProperty({ format: 'date' }) asOfDate!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) branchId!: string | null;
  @ApiProperty() currency!: string;
  @ApiProperty({ type: StatementSectionDto }) assets!: StatementSectionDto;
  @ApiProperty({ type: StatementSectionDto }) liabilities!: StatementSectionDto;
  @ApiProperty({ type: StatementSectionDto }) equity!: StatementSectionDto;
  @ApiProperty({ description: 'Income less expenses not yet closed to equity (no year-end close yet)' })
  unclosedResult!: string;
  @ApiProperty() totalEquity!: string;
  @ApiProperty() totalLiabilitiesAndEquity!: string;
  @ApiProperty({ description: 'Assets = liabilities + equity' }) balanced!: boolean;
  @ApiProperty() difference!: string;
  @ApiProperty({ format: 'date-time' }) asOf!: string;
}

export class AgingPartyDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() documents!: number;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' } }) buckets!: Record<string, string>;
  @ApiProperty() total!: string;
}

export class AgingDocumentDto {
  @ApiProperty() id!: string;
  @ApiProperty() number!: string;
  @ApiProperty() partyId!: string;
  @ApiProperty() partyName!: string;
  @ApiProperty({ format: 'date' }) date!: string;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'date' }) dueDate!: string | null;
  @ApiProperty() total!: string;
  @ApiProperty() balance!: string;
  @ApiProperty() bucket!: string;
  @ApiProperty({ description: 'Receivables: days since the invoice; payables: days past due' }) days!: number;
}

export class AgingDto {
  @ApiProperty({ enum: ['receivable', 'payable'] }) kind!: string;
  @ApiProperty({ format: 'date' }) asOfDate!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) branchId!: string | null;
  @ApiProperty() currency!: string;
  @ApiProperty({ type: [String], description: 'Bucket keys in display order' }) buckets!: string[];
  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' } }) totals!: Record<string, string>;
  @ApiProperty() total!: string;
  @ApiProperty({ type: [AgingPartyDto], description: 'Largest balance first' }) parties!: AgingPartyDto[];
  @ApiProperty({ type: [AgingDocumentDto], description: 'Open documents, oldest first (up to 500)' })
  documents!: AgingDocumentDto[];
  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Control account balance at the cut-off',
  })
  ledgerBalance!: string | null;
  @ApiProperty({ description: 'Open documents equal the control account balance' }) reconciled!: boolean;
  @ApiProperty({ format: 'date-time' }) asOf!: string;
}

export class CashFlowCategoryDto {
  @ApiProperty({ enum: ['customer_receipts', 'supplier_payments', 'manual', 'reversals', 'other'] })
  key!: string;
  @ApiProperty() inflow!: string;
  @ApiProperty() outflow!: string;
  @ApiProperty() net!: string;
  @ApiProperty() journals!: number;
}

export class CashFlowDto {
  @ApiProperty({ format: 'date' }) from!: string;
  @ApiProperty({ format: 'date' }) to!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) branchId!: string | null;
  @ApiProperty() currency!: string;
  @ApiProperty({ description: 'At least one account is classed cash or bank' }) configured!: boolean;
  @ApiProperty() opening!: string;
  @ApiProperty({ type: [CashFlowCategoryDto] }) categories!: CashFlowCategoryDto[];
  @ApiProperty({ description: 'Journals that only moved money between cash accounts' })
  internalTransfers!: number;
  @ApiProperty() inflow!: string;
  @ApiProperty() outflow!: string;
  @ApiProperty() net!: string;
  @ApiProperty() closing!: string;
  @ApiProperty({ description: 'Opening + inflow − outflow = closing' }) reconciled!: boolean;
  @ApiProperty({ format: 'date-time' }) asOf!: string;
}

export class TaxRowDto {
  @ApiPropertyOptional({ nullable: true, type: String, description: 'Null = documents without tax' })
  taxCode!: string | null;
  @ApiProperty() documents!: number;
  @ApiProperty({ description: 'Amount excluding tax' }) taxable!: string;
  @ApiProperty() tax!: string;
}

export class TaxSummaryDto {
  @ApiProperty({ format: 'date' }) from!: string;
  @ApiProperty({ format: 'date' }) to!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) branchId!: string | null;
  @ApiProperty() currency!: string;
  @ApiProperty({ type: [TaxRowDto], description: 'Invoices less credit notes' }) output!: TaxRowDto[];
  @ApiProperty({ type: [TaxRowDto], description: 'Supplier bills less cancellations' }) input!: TaxRowDto[];
  @ApiProperty() outputTax!: string;
  @ApiProperty() inputTax!: string;
  @ApiProperty({ description: 'Output − input (negative = refundable)' }) netTax!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) outputLedger!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) inputLedger!: string | null;
  @ApiProperty() outputReconciled!: boolean;
  @ApiProperty() inputReconciled!: boolean;
  @ApiProperty({ format: 'date-time' }) asOf!: string;
}
