import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const SIGNED = 'Signed amount in the company currency: positive = debit balance, negative = credit balance';

export class LedgerAccountDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) nameAr!: string | null;
  @ApiProperty({ enum: ['asset', 'liability', 'equity', 'revenue', 'expense'] }) type!: string;
  @ApiProperty() isPosting!: boolean;
  @ApiProperty({ enum: ['active', 'inactive'] }) status!: string;
}

export class TrialBalanceRowDto {
  @ApiProperty({ type: LedgerAccountDto }) account!: LedgerAccountDto;
  @ApiProperty({ description: 'Depth in the chart of accounts (0 = top level)' }) level!: number;
  @ApiProperty({ description: `Balance before "from". ${SIGNED}` }) opening!: string;
  @ApiProperty() periodDebit!: string;
  @ApiProperty() periodCredit!: string;
  @ApiProperty({ description: `opening + periodDebit − periodCredit. ${SIGNED}` }) closing!: string;
}

export class TrialBalanceTotalsDto {
  @ApiProperty() openingDebit!: string;
  @ApiProperty() openingCredit!: string;
  @ApiProperty() periodDebit!: string;
  @ApiProperty() periodCredit!: string;
  @ApiProperty() closingDebit!: string;
  @ApiProperty() closingCredit!: string;
}

export class TrialBalanceDto {
  @ApiProperty() currency!: string;
  @ApiProperty({ format: 'date' }) from!: string;
  @ApiProperty({ format: 'date' }) to!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) branchId!: string | null;
  @ApiProperty({ enum: ['company', 'branches'] }) scope!: 'company' | 'branches';
  @ApiProperty({ format: 'date-time', description: 'When the figures were read from the posted ledger' })
  asOf!: string;
  @ApiProperty({
    type: [TrialBalanceRowDto],
    description: 'Chart order; header accounts show the sum of their descendants',
  })
  rows!: TrialBalanceRowDto[];
  @ApiProperty({ type: TrialBalanceTotalsDto, description: 'Posting accounts only' })
  totals!: TrialBalanceTotalsDto;
  @ApiProperty({ description: 'Debits equal credits for opening, period and closing' }) balanced!: boolean;
  @ApiProperty({
    description: 'Revenue − COGS − operating expenses in the range (same formula as the dashboard)',
  })
  periodResult!: string;
}

export class GeneralLedgerLineDto {
  @ApiProperty() lineId!: string;
  @ApiProperty() journalId!: string;
  @ApiProperty() journalNumber!: string;
  @ApiProperty({ format: 'date' }) postingDate!: string;
  @ApiProperty({ enum: ['manual', 'reversal'] }) sourceType!: string;
  @ApiProperty() description!: string;
  @ApiProperty() debit!: string;
  @ApiProperty() credit!: string;
  @ApiProperty({ description: `Running balance after this line. ${SIGNED}` }) balance!: string;
}

export class GeneralLedgerDto {
  @ApiProperty() currency!: string;
  @ApiProperty({ type: LedgerAccountDto }) account!: LedgerAccountDto;
  @ApiProperty({ format: 'date' }) from!: string;
  @ApiProperty({ format: 'date' }) to!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) branchId!: string | null;
  @ApiProperty({ enum: ['company', 'branches'] }) scope!: 'company' | 'branches';
  @ApiProperty({ format: 'date-time' }) asOf!: string;
  @ApiProperty({ description: `Balance before "from". ${SIGNED}` }) opening!: string;
  @ApiProperty({ description: 'Whole range, not just this page' }) periodDebit!: string;
  @ApiProperty({ description: 'Whole range, not just this page' }) periodCredit!: string;
  @ApiProperty({ description: `Balance at the end of "to". ${SIGNED}` }) closing!: string;
  @ApiProperty({ description: 'Number of lines in the whole range' }) lineCount!: number;
  @ApiProperty({ description: `Balance before the first line of this page. ${SIGNED}` })
  pageOpening!: string;
  @ApiProperty({ type: [GeneralLedgerLineDto] }) lines!: GeneralLedgerLineDto[];
  @ApiPropertyOptional({ nullable: true, type: String, description: 'Pass as "cursor" for the next page' })
  nextCursor!: string | null;
}
