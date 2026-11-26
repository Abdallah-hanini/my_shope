import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ExportJobDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['trial_balance', 'general_ledger', 'journal_lines'] }) kind!: string;
  @ApiProperty({ enum: ['csv', 'xlsx'] }) format!: string;
  @ApiProperty({ enum: ['en', 'ar'] }) locale!: string;
  @ApiProperty({ type: 'object', additionalProperties: true, description: 'Report filters as requested' })
  params!: Record<string, unknown>;
  @ApiProperty({ enum: ['queued', 'running', 'succeeded', 'failed', 'expired'] }) status!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) error!: string | null;
  @ApiPropertyOptional({ nullable: true, type: Number }) rowCount!: number | null;
  @ApiPropertyOptional({ nullable: true, type: String }) fileName!: string | null;
  @ApiPropertyOptional({ nullable: true, type: Number }) sizeBytes!: number | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' }) finishedAt!: string | null;
  @ApiPropertyOptional({
    nullable: true,
    type: String,
    format: 'date-time',
    description: 'The file is deleted after this time',
  })
  expiresAt!: string | null;
}

export class CreateExportDto {
  @ApiProperty({ enum: ['trial_balance', 'general_ledger', 'journal_lines'] }) kind!: string;
  @ApiProperty({ enum: ['csv', 'xlsx'] }) format!: string;
  @ApiPropertyOptional({ enum: ['en', 'ar'], default: 'en', description: 'Language of headers and labels' })
  locale?: string;
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description:
      'trial_balance: {from, to, branchId?, includeZero?}; general_ledger: {accountId, from, to, branchId?}; journal_lines: {from, to, branchId?}',
  })
  params!: Record<string, unknown>;
}
