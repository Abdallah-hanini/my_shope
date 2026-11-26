import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class QuoteLineDto {
  @ApiProperty() lineNo!: number;
  @ApiProperty() taskId!: string;
  @ApiProperty() description!: string;
  @ApiProperty({ example: '1.50' }) hours!: string;
  @ApiProperty({ example: '150.00', description: 'Labour rate per hour used' }) rate!: string;
  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Price set by hand instead of hours × rate',
  })
  overrideAmount!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) overrideReason!: string | null;
  @ApiProperty({ example: '225.00' }) amount!: string;
}

export class QuoteDto {
  @ApiProperty() id!: string;
  @ApiProperty() revision!: number;
  @ApiPropertyOptional({ nullable: true, type: String, example: 'Q-2026-000001' }) number!: string | null;
  @ApiProperty({ enum: ['draft', 'issued', 'approved', 'declined', 'superseded'] }) status!: string;
  @ApiProperty({ example: 'QAR' }) currency!: string;
  @ApiPropertyOptional({ nullable: true, type: String, example: '2026-11-29' }) quoteDate!: string | null;
  @ApiProperty({ example: '5.0000' }) discountPct!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) discountReason!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) discountSetByName!: string | null;
  @ApiProperty({ description: 'The discount is above the managers’ limit and not yet approved' })
  discountNeedsApproval!: boolean;
  @ApiPropertyOptional({ nullable: true, type: String }) discountApprovedByName!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String, description: 'null = no tax' }) taxCode!:
    | string
    | null;
  @ApiPropertyOptional({ nullable: true, type: String }) taxPct!: string | null;
  @ApiProperty() pricesIncludeTax!: boolean;
  @ApiProperty() subtotal!: string;
  @ApiProperty() discountAmount!: string;
  @ApiProperty() netAmount!: string;
  @ApiProperty() taxAmount!: string;
  @ApiProperty() total!: string;
  @ApiProperty({ type: [QuoteLineDto] }) lines!: QuoteLineDto[];
  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' }) issuedAt!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) issuedByName!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' }) decidedAt!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) decidedByName!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) authorizedByName!: string | null;
  @ApiPropertyOptional({ nullable: true, enum: ['in_person', 'phone', 'written'], type: String })
  authorizedVia!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) declineReason!: string | null;
  @ApiProperty() version!: number;
  @ApiProperty({
    type: [String],
    description: 'What the caller can do now (edit, discard, approveDiscount, issue, decide)',
  })
  actions!: string[];
}

export class JobQuotesDto {
  @ApiProperty() jobId!: string;
  @ApiProperty() currency!: string;
  @ApiPropertyOptional({ nullable: true, type: String, description: 'Branch labour rate today' })
  labourRate!: string | null;
  @ApiProperty({ example: '10.0000' }) managerDiscountLimitPct!: string;
  @ApiProperty({ type: [QuoteDto], description: 'Newest revision first' }) quotes!: QuoteDto[];
  @ApiProperty({ description: 'The caller can start a new draft now' }) canCreate!: boolean;
}

export class QuoteLineChangeDto {
  @ApiProperty() taskId!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) overrideAmount!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) overrideReason?: string | null;
}
export class UpdateQuoteDto {
  @ApiProperty() version!: number;
  @ApiProperty({ example: '5' }) discountPct!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) discountReason?: string | null;
  @ApiProperty({ type: [QuoteLineChangeDto] }) lines!: QuoteLineChangeDto[];
}
export class QuoteVersionDto {
  @ApiProperty() version!: number;
}
export class QuoteDecisionDto {
  @ApiProperty({ enum: ['approve', 'decline'] }) decision!: string;
  @ApiProperty() version!: number;
  @ApiPropertyOptional() authorizedByName?: string;
  @ApiPropertyOptional({ enum: ['in_person', 'phone', 'written'] }) authorizedVia?: string;
  @ApiPropertyOptional() reason?: string;
}
