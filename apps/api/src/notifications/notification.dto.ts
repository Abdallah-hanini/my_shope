import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const NOTIFICATION_KINDS = [
  'journal_reversed',
  'role_granted',
  'role_revoked',
  'role_changed',
  'period_closed',
  'export_ready',
  'export_failed',
  'job_assigned',
  'job_rework',
  'job_ready',
] as const;

export class NotificationDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: NOTIFICATION_KINDS }) kind!: string;
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string', nullable: true },
    description:
      'Values for the message text, by kind (e.g. number, reversalNumber, role, roleAr, branch, period, actor, exportKind, fileName, error)',
  })
  params!: Record<string, string | null>;
  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Path inside the company, e.g. "journals/<id>"',
  })
  link!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' }) readAt!: string | null;
}

export class NotificationPageDto {
  @ApiProperty({ type: [NotificationDto] }) items!: NotificationDto[];
  @ApiProperty() unreadCount!: number;
  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Pass as "cursor" for older notifications',
  })
  nextCursor!: string | null;
}

export class UnreadCountDto {
  @ApiProperty() unreadCount!: number;
}
