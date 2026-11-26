import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { notificationListQuerySchema, type NotificationListQuery } from '@erp/validation';
import { CurrentPrincipal } from '../auth/decorators';
import type { Principal } from '../auth/principal';
import { ZodPipe } from '../common/zod.pipe';
import { NotificationDto, NotificationPageDto, UnreadCountDto } from './notification.dto';
import { NotificationService } from './notification.service';

const uuid404 = new ParseUUIDPipe({ errorHttpStatusCode: 404 });

/** The caller's own notifications in a company (any member). */
@ApiTags('notifications')
@ApiBearerAuth()
@ApiParam({ name: 'companyId', format: 'uuid' })
@Controller({ path: 'companies/:companyId/notifications' })
export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  @ApiOperation({ operationId: 'listNotifications', summary: 'Newest first, with the unread count' })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'unreadOnly', required: false, enum: ['true', 'false'] })
  @ApiQuery({ name: 'limit', required: false, description: '1–100, default 20' })
  @ApiOkResponse({ type: NotificationPageDto })
  list(
    @CurrentPrincipal() p: Principal,
    @Param('companyId', uuid404) companyId: string,
    @Query(new ZodPipe(notificationListQuerySchema)) q: NotificationListQuery,
  ): Promise<NotificationPageDto> {
    return this.notifications.list(companyId, p, q);
  }

  @Get('unread-count')
  @ApiOperation({ operationId: 'countUnreadNotifications' })
  @ApiOkResponse({ type: UnreadCountDto })
  async count(
    @CurrentPrincipal() p: Principal,
    @Param('companyId', uuid404) companyId: string,
  ): Promise<UnreadCountDto> {
    return { unreadCount: await this.notifications.unreadCount(companyId, p) };
  }

  @Post('read-all')
  @HttpCode(200)
  @ApiOperation({ operationId: 'markAllNotificationsRead' })
  @ApiOkResponse({ type: UnreadCountDto, description: 'unreadCount is 0 afterwards' })
  async readAll(
    @CurrentPrincipal() p: Principal,
    @Param('companyId', uuid404) companyId: string,
  ): Promise<UnreadCountDto> {
    await this.notifications.markAllRead(companyId, p);
    return { unreadCount: 0 };
  }

  @Post(':notificationId/read')
  @HttpCode(200)
  @ApiParam({ name: 'notificationId', format: 'uuid' })
  @ApiOperation({ operationId: 'markNotificationRead' })
  @ApiOkResponse({ type: NotificationDto })
  read(
    @CurrentPrincipal() p: Principal,
    @Param('companyId', uuid404) companyId: string,
    @Param('notificationId', uuid404) id: string,
  ): Promise<NotificationDto> {
    return this.notifications.markRead(companyId, p, id);
  }
}
