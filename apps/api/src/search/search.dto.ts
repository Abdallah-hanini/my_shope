import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const SEARCH_TYPES = ['journal', 'account', 'branch', 'period', 'user'] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];

export class SearchHitDto {
  @ApiProperty() id!: string;
  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Journal number, account or branch code',
  })
  code!: string | null;
  @ApiProperty({ description: 'Description, name, period name or person name' }) name!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) nameAr!: string | null;
  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'journal: total; account: type; user: email; period: status',
  })
  detail!: string | null;
  @ApiPropertyOptional({
    nullable: true,
    type: String,
    format: 'date',
    description: 'journal: posting date; period: start date',
  })
  date!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String, description: 'Status where the record has one' })
  status!: string | null;
}

export class SearchGroupDto {
  @ApiProperty({ enum: SEARCH_TYPES }) type!: SearchType;
  @ApiProperty({ type: [SearchHitDto] }) items!: SearchHitDto[];
  @ApiProperty({ description: 'More matches exist than were returned' }) more!: boolean;
}

export class SearchResultDto {
  @ApiProperty({ description: 'The query as matched (trimmed, spaces collapsed)' }) query!: string;
  @ApiProperty({
    type: [SearchGroupDto],
    description: 'Only the record types the caller may read, in a fixed order; empty groups included',
  })
  groups!: SearchGroupDto[];
}
