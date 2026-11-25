import { Global, Inject, Logger, Module, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import type Redis from 'ioredis';
import { API_ENV, type ApiEnv } from '../config/env';
import { PrismaService } from './prisma.service';
import { CACHE_REDIS, createRedis, QUEUE_REDIS } from './redis';

@Global()
@Module({
  providers: [
    PrismaService,
    {
      provide: CACHE_REDIS,
      inject: [API_ENV],
      useFactory: (env: ApiEnv) => createRedis(env.REDIS_CACHE_URL, 'erp-api-cache'),
    },
    {
      provide: QUEUE_REDIS,
      inject: [API_ENV],
      useFactory: (env: ApiEnv) => createRedis(env.REDIS_QUEUE_URL, 'erp-api-queue'),
    },
  ],
  exports: [PrismaService, CACHE_REDIS, QUEUE_REDIS],
})
export class InfraModule implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(InfraModule.name);

  constructor(
    @Inject(CACHE_REDIS) private readonly cache: Redis,
    @Inject(QUEUE_REDIS) private readonly queue: Redis,
  ) {}

  onModuleInit(): void {
    for (const [name, client] of [
      ['cache', this.cache],
      ['queue', this.queue],
    ] as const) {
      client.on('error', (err: Error) => this.logger.warn(`redis ${name}: ${err.message}`));
      // Connection is attempted in the background; readiness reports the outcome.
      client
        .connect()
        .catch((err: Error) => this.logger.warn(`redis ${name} initial connect failed: ${err.message}`));
    }
  }

  async onApplicationShutdown(): Promise<void> {
    // quit() flushes pending replies when connected; disconnect() stops a reconnect loop immediately.
    await Promise.allSettled(
      [this.cache, this.queue].map((c) =>
        c.status === 'ready' ? c.quit() : Promise.resolve(c.disconnect()),
      ),
    );
  }
}
