import { Injectable } from '@nestjs/common';
import type { Notification } from '@prisma/client';
import type { Principal } from '../auth/principal';
import { AuthzService } from '../authz/authz.service';
import { notFound, unprocessable } from '../common/errors';
import { PrismaService } from '../infra/prisma.service';
import type { NotificationDto, NotificationPageDto } from './notification.dto';

const toDto = (n: Notification): NotificationDto => ({
  id: n.id,
  kind: n.kind,
  params: n.params as Record<string, string | null>,
  link: n.link,
  createdAt: n.createdAt.toISOString(),
  readAt: n.readAt?.toISOString() ?? null,
});

/** Keyset cursor: "<createdAt ISO>_<id>" in base64url. */
const encode = (n: Notification) => Buffer.from(`${n.createdAt.toISOString()}_${n.id}`).toString('base64url');
function decode(raw: string): { at: Date; id: string } {
  const m = /^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)_([0-9a-f-]{36})$/.exec(
    Buffer.from(raw, 'base64url').toString('utf8'),
  );
  if (!m) throw unprocessable('cursor is not valid; start again from the newest');
  return { at: new Date(m[1]!), id: m[2]! };
}

/** WEB inbox: a person's own notifications in one company. Nobody can read anyone else's. */
@Injectable()
export class NotificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthzService,
  ) {}

  /** Members only; others get 404 like for any company they cannot see. */
  private async member(companyId: string, p: Principal): Promise<void> {
    if ((await this.authz.grants(p.userId, companyId)).length === 0) throw notFound('Company');
  }

  async unreadCount(companyId: string, p: Principal): Promise<number> {
    await this.member(companyId, p);
    return this.prisma.notification.count({ where: { companyId, userId: p.userId, readAt: null } });
  }

  async list(
    companyId: string,
    p: Principal,
    q: { cursor?: string; unreadOnly?: boolean; limit: number },
  ): Promise<NotificationPageDto> {
    await this.member(companyId, p);
    const c = q.cursor ? decode(q.cursor) : undefined;
    const rows = await this.prisma.notification.findMany({
      where: {
        companyId,
        userId: p.userId,
        ...(q.unreadOnly ? { readAt: null } : {}),
        ...(c ? { OR: [{ createdAt: { lt: c.at } }, { createdAt: c.at, id: { lt: c.id } }] } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
    });
    const page = rows.slice(0, q.limit);
    return {
      items: page.map(toDto),
      unreadCount: await this.prisma.notification.count({
        where: { companyId, userId: p.userId, readAt: null },
      }),
      nextCursor: rows.length > q.limit ? encode(page.at(-1)!) : null,
    };
  }

  async markRead(companyId: string, p: Principal, id: string): Promise<NotificationDto> {
    await this.member(companyId, p);
    const n = await this.prisma.notification.findFirst({ where: { id, companyId, userId: p.userId } });
    if (!n) throw notFound('Notification');
    if (n.readAt) return toDto(n);
    return toDto(await this.prisma.notification.update({ where: { id }, data: { readAt: new Date() } }));
  }

  async markAllRead(companyId: string, p: Principal): Promise<number> {
    await this.member(companyId, p);
    return (
      await this.prisma.notification.updateMany({
        where: { companyId, userId: p.userId, readAt: null },
        data: { readAt: new Date() },
      })
    ).count;
  }
}
