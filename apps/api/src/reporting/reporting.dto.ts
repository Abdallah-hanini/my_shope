import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class FinancialTotalsDto {
  @ApiProperty({ example: '2830.25', description: 'Σ(credit − debit) on revenue accounts' }) revenue!: string;
  @ApiProperty({ description: 'Σ(debit − credit) on expense accounts classed "cogs"' }) cogs!: string;
  @ApiProperty({ description: 'revenue − cogs' }) grossProfit!: string;
  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'grossProfit ÷ revenue × 100, 1 decimal; null when revenue is 0',
  })
  grossMarginPercent!: string | null;
  @ApiProperty({ description: 'Σ(debit − credit) on other expense accounts' }) operatingExpenses!: string;
  @ApiProperty({ description: 'revenue − cogs − operatingExpenses' }) netProfit!: string;
  @ApiProperty({ description: 'Balance of cash and bank accounts at the end of the range (all history)' })
  cashAndBank!: string;
  @ApiProperty({ description: 'Posted journals in the range (including reversals)' }) journalCount!: number;
}

export class MonthlyFigureDto {
  @ApiProperty({ example: '2026-11' }) month!: string;
  @ApiProperty() revenue!: string;
  @ApiProperty() cogs!: string;
  @ApiProperty() operatingExpenses!: string;
  @ApiProperty() netProfit!: string;
}

export class BranchFigureDto {
  @ApiPropertyOptional({ nullable: true, type: String, description: 'null = company-level journals' })
  branchId!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) code!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) name!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) nameAr!: string | null;
  @ApiProperty() revenue!: string;
  @ApiProperty() expenses!: string;
  @ApiProperty() netProfit!: string;
}

export class ReportExceptionDto {
  @ApiProperty({ enum: ['period_open_after_end', 'reversal_in_range', 'no_cash_accounts'] }) kind!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) recordId!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) label!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'date' }) date!: string | null;
}

export class FinancialSummaryDto {
  @ApiProperty() currency!: string;
  @ApiProperty({ example: '2026-01' }) from!: string;
  @ApiProperty({ example: '2026-12' }) to!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) branchId!: string | null;
  @ApiProperty({
    enum: ['company', 'branches'],
    description: 'company = all journals; branches = only the caller’s branches',
  })
  scope!: 'company' | 'branches';
  @ApiProperty({ format: 'date-time', description: 'When the figures were computed from the posted ledger' })
  asOf!: string;
  @ApiProperty({ type: FinancialTotalsDto }) totals!: FinancialTotalsDto;
  @ApiProperty({ type: [MonthlyFigureDto] }) months!: MonthlyFigureDto[];
  @ApiProperty({ type: [BranchFigureDto] }) branches!: BranchFigureDto[];
  @ApiProperty({ type: [ReportExceptionDto] }) exceptions!: ReportExceptionDto[];
}
