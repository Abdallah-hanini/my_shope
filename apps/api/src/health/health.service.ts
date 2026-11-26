import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { PrismaService } from '../infra/prisma.service';
import { CACHE_REDIS, QUEUE_REDIS } from '../infra/redis';
import { APP_VERSION } from '../version';
import type { DependencyCheckDto, HealthReportDto, LivenessDto } from './health.dto';

export const CHECK_TIMEOUT_MS = 1500;

export type Probe = () => Promise<unknown>;

export async function runCheck(
  name: DependencyCheckDto['name'],
  probe: Probe,
  timeoutMs = CHECK_TIMEOUT_MS,
): Promise<DependencyCheckDto> {
  const started = performance.now();
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      probe(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
    return { name, status: 'up', latencyMs: Math.round(performance.now() - started) };
  } catch (err) {
    return { name, status: 'down', latencyMs: Math.round(performance.now() - started), error: sanitize(err) };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Keeps failure reasons short and strips anything that looks like a connection string. */
export function sanitize(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg
    .replace(/[a-z]+:\/\/\S+/gi, '[redacted-url]')
    .split('\n')[0]!
    .slice(0, 160);
}

export function aggregate(checks: DependencyCheckDto[], now: Date = new Date()): HealthReportDto {
  return {
    status: checks.every((c) => c.status === 'up') ? 'up' : 'down',
    checkedAt: now.toISOString(),
    version: APP_VERSION,
    checks,
  };
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_REDIS) private readonly cache: Redis,
    @Inject(QUEUE_REDIS) private readonly queue: Redis,
  ) {}

  live(): LivenessDto {
    return { status: 'up', uptimeSeconds: Math.round(process.uptime()), version: APP_VERSION };
  }

  async ready(): Promise<HealthReportDto> {
    const checks = await Promise.all([
      runCheck('database', () => this.prisma.$queryRaw`SELECT 1`),
      runCheck('cache', () => this.cache.ping()),
      runCheck('queue', () => this.queue.ping()),
    ]);
    const report = aggregate(checks);
    if (checks[0]?.status === 'up') {
      const [pending, deadLettered] = await Promise.all([
        this.prisma.outboxEvent.count({ where: { publishedAt: null, deadLetteredAt: null } }),
        this.prisma.outboxEvent.count({ where: { deadLetteredAt: { not: null } } }),
      ]).catch(() => [null, null] as const);
      report.events = pending === null || deadLettered === null ? null : { pending, deadLettered };
    } else {
      report.events = null;
    }
    return report;
  }
}
