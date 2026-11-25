import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export type CheckStatus = 'up' | 'down';

export class LivenessDto {
  @ApiProperty({ enum: ['up'] })
  status!: 'up';

  @ApiProperty({ description: 'Seconds since the process started' })
  uptimeSeconds!: number;

  @ApiProperty()
  version!: string;
}

export class DependencyCheckDto {
  @ApiProperty({ enum: ['database', 'cache', 'queue'] })
  name!: 'database' | 'cache' | 'queue';

  @ApiProperty({ enum: ['up', 'down'] })
  status!: CheckStatus;

  @ApiProperty({ description: 'Round-trip time of the check in milliseconds' })
  latencyMs!: number;

  @ApiPropertyOptional({ description: 'Short, non-sensitive failure reason' })
  error?: string;
}

export class HealthReportDto {
  @ApiProperty({ enum: ['up', 'down'] })
  status!: CheckStatus;

  @ApiProperty({ format: 'date-time', description: 'UTC time the checks ran (freshness)' })
  checkedAt!: string;

  @ApiProperty()
  version!: string;

  @ApiProperty({ type: [DependencyCheckDto] })
  checks!: DependencyCheckDto[];
}

/** RFC 9457 problem details. */
export class ProblemDetailsDto {
  @ApiProperty({ example: 'about:blank' })
  type!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  status!: number;

  @ApiPropertyOptional()
  detail?: string;

  @ApiProperty({ description: 'Request path' })
  instance!: string;

  @ApiPropertyOptional({ description: 'Correlation id, also returned in the x-request-id header' })
  requestId?: string;
}
