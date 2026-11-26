import { Inject, Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { Prisma, type OutboxEvent } from '@prisma/client';
import { API_ENV, type ApiEnv } from '../config/env';
import { PrismaService } from '../infra/prisma.service';
import { RULES } from '../notifications/rules';

/** After this many failed deliveries an event is dead-lettered for an operator to inspect. */
export const MAX_ATTEMPTS = 10;
/** Read notifications are deleted after this many days. */
const READ_RETENTION_DAYS = 90;
/** Delivered outbox events are deleted after this many days. */
const PUBLISHED_RETENTION_DAYS = 30;

/** Exponential backoff: 2 s, 4 s, 8 s … capped at one hour. */
export function retryDelayMs(attempts: number): number {
  return Math.min(2 ** attempts * 1000, 3_600_000);
}

/**
 * Transactional-outbox dispatcher (P1-11). Each event is delivered in its own transaction together
 * with everything its consumers write (notifications), then marked published, so a crash can
 * neither lose nor double-deliver it; unique (event, user) keys make a re-run harmless anyway.
 * `FOR UPDATE SKIP LOCKED` lets several API instances share the work. Failures are retried with
 * backoff and dead-lettered after MAX_ATTEMPTS, never silently dropped.
 */
@Injectable()
export class OutboxDispatcher implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(OutboxDispatcher.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  private lastHousekeeping = 0;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  onModuleInit(): void {
    if (this.env.OUTBOX_DISPATCHER === 'off') return;
    this.timer = setInterval(() => void this.tick(), this.env.OUTBOX_POLL_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.drain();
      if (Date.now() - this.lastHousekeeping > 3_600_000) {
        this.lastHousekeeping = Date.now();
        await this.housekeeping();
      }
    } catch (e) {
      this.logger.error(`outbox dispatch failed: ${String(e)}`);
    } finally {
      this.running = false;
    }
  }

  /**
   * Deletes read notifications after READ_RETENTION_DAYS and delivered events after
   * PUBLISHED_RETENTION_DAYS (the audit trail is the permanent history). Dead letters are kept.
   */
  async housekeeping(): Promise<{ notifications: number; events: number }> {
    const notifications = await this.prisma.notification.deleteMany({
      where: { readAt: { lt: new Date(Date.now() - READ_RETENTION_DAYS * 86_400_000) } },
    });
    const events = await this.prisma.outboxEvent.deleteMany({
      where: { publishedAt: { lt: new Date(Date.now() - PUBLISHED_RETENTION_DAYS * 86_400_000) } },
    });
    return { notifications: notifications.count, events: events.count };
  }

  /** Delivers due events until none are left (or `max` were handled). Returns how many were handled. */
  async drain(max = 200): Promise<number> {
    let handled = 0;
    while (handled < max) {
      const outcome = await this.deliverNext();
      if (outcome === 'none') break;
      handled++;
    }
    return handled;
  }

  private async deliverNext(): Promise<'none' | 'delivered' | 'failed'> {
    let event: OutboxEvent | undefined;
    try {
      const done = await this.prisma.$transaction(async (tx) => {
        const [next] = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM platform.outbox_event
           WHERE published_at IS NULL AND dead_lettered_at IS NULL AND available_at <= now()
           ORDER BY occurred_at, id
           LIMIT 1
           FOR UPDATE SKIP LOCKED`;
        if (!next) return false;
        event = await tx.outboxEvent.findUniqueOrThrow({ where: { id: next.id } });
        const rule = RULES[event.eventType];
        if (rule && event.companyId) {
          const drafts = await rule(tx, { ...event, companyId: event.companyId });
          if (drafts.length) {
            await tx.notification.createMany({
              data: drafts.map((d) => ({
                companyId: event!.companyId!,
                userId: d.userId,
                eventId: event!.id,
                kind: d.kind,
                params: d.params as Prisma.InputJsonValue,
                link: d.link,
              })),
              skipDuplicates: true,
            });
          }
        }
        await tx.outboxEvent.update({
          where: { id: event.id },
          data: { publishedAt: new Date(), lastError: null },
        });
        return true;
      });
      return done ? 'delivered' : 'none';
    } catch (err) {
      if (!event) throw err; // could not even read the queue: let the caller log it
      const attempts = event.attempts + 1;
      const dead = attempts >= MAX_ATTEMPTS;
      const message = err instanceof Error ? err.message : String(err);
      await this.prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          attempts,
          lastError: message.slice(0, 2000),
          availableAt: new Date(Date.now() + retryDelayMs(attempts)),
          ...(dead ? { deadLetteredAt: new Date() } : {}),
        },
      });
      (dead ? this.logger.error : this.logger.warn).call(
        this.logger,
        `outbox event ${event.id} (${event.eventType}) ${dead ? 'dead-lettered' : 'will be retried'} after attempt ${attempts}: ${message}`,
      );
      return 'failed';
    }
  }

  /** Counts for the health report: waiting events and dead letters. */
  async backlog(): Promise<{ pending: number; deadLettered: number }> {
    const [pending, deadLettered] = await Promise.all([
      this.prisma.outboxEvent.count({ where: { publishedAt: null, deadLetteredAt: null } }),
      this.prisma.outboxEvent.count({ where: { deadLetteredAt: { not: null } } }),
    ]);
    return { pending, deadLettered };
  }
}
