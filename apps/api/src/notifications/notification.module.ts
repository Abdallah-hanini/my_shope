import { Module } from '@nestjs/common';
import { OutboxDispatcher } from '../platform/outbox-dispatcher';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';

@Module({
  controllers: [NotificationController],
  providers: [NotificationService, OutboxDispatcher],
  exports: [OutboxDispatcher],
})
export class NotificationModule {}
