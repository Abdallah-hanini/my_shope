import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class JobPartDto {
  @ApiProperty() id!: string;
  @ApiProperty() partId!: string;
  @ApiProperty() sku!: string;
  @ApiProperty() name!: string;
  @ApiProperty() unit!: string;
  @ApiProperty({ example: '4.500' }) quantity!: string;
  @ApiProperty({ enum: ['reserved', 'issued', 'returned', 'released'] }) status!: string;
  @ApiPropertyOptional({ nullable: true, type: String, description: 'Stock value taken out (issued)' })
  cost!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String, description: 'Selling price per unit' }) salePrice!:
    | string
    | null;
  @ApiPropertyOptional({ nullable: true, type: String }) issueNumber!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) returnNumber!: string | null;
  @ApiProperty({ type: [String], description: 'release, issue, return' }) actions!: string[];
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
}

export class AddJobPartDto {
  @ApiProperty() partId!: string;
  @ApiProperty({ example: '4.5' }) quantity!: string;
}
export class JobPartStepDto {
  @ApiProperty({ description: 'A new UUID per form' }) idempotencyKey!: string;
}
