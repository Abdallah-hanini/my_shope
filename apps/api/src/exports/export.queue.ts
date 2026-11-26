import { Inject, Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { API_ENV, type ApiEnv } from '../config/env';
import { ExportService } from './export.service';

export const EXPORT_QUEUE = 'exports';
const SWEEP_MS = 60_000;

/**
 * Runs export jobs in this API process (one at a time) and the minute-by-minute housekeeping.
 * The BullMQ job id is the export id, so enqueuing twice is harmless; the database claim in
 * ExportService.process makes a replayed message a no-op. Disabled with EXPORT_WORKER=off.
 */
@Injectable()
export class ExportQueue implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(ExportQueue.name);
  private connection?: IORedis;
  private queue?: Queue;
  private worker?: Worker;
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly exports: ExportService,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  onModuleInit(): void {
    if (this.env.EXPORT_WORKER === 'off') return;
    // BullMQ needs maxRetriesPerRequest=null; connecting lazily keeps start-up independent of Redis.
    this.connection = new IORedis(this.env.REDIS_QUEUE_URL, {
      maxRetriesPerRequest: null,
      connectionName: 'erp-api-exports',
    });
    this.connection.on('error', (e: Error) => this.logger.warn(`export queue redis: ${e.message}`));
    this.queue = new Queue(EXPORT_QUEUE, { connection: this.connection });
    this.worker = new Worker(EXPORT_QUEUE, async (job) => this.exports.process(String(job.data.exportId)), {
      connection: this.connection,
      concurrency: 1,
    });
    this.worker.on('failed', (job, err) =>
      this.logger.error(`export job ${job?.id} failed in the queue: ${err.message}`),
    );
    this.timer = setInterval(() => void this.sweep(), SWEEP_MS);
    this.timer.unref();
  }

  /** Enqueues an export. If Redis is down the job stays "queued" in PostgreSQL and the sweep retries. */
  async enqueue(exportId: string): Promise<void> {
    if (!this.queue) return;
    try {
      await this.queue.add(
        'export',
        { exportId },
        { jobId: exportId, removeOnComplete: 1000, removeOnFail: 1000 },
      );
    } catch (e) {
      this.logger.warn(`could not enqueue export ${exportId}; the sweep will retry: ${String(e)}`);
    }
  }

  async sweep(): Promise<void> {
    try {
      const r = await this.exports.sweep();
      if (r.expired || r.interrupted)
        this.logger.log(`exports: ${r.expired} expired, ${r.interrupted} interrupted`);
      for (const id of r.waiting) {
        // A completed BullMQ entry with the same id would block re-adding; remove it first.
        await this.queue?.remove(id).catch(() => undefined);
        await this.enqueue(id);
      }
    } catch (e) {
      this.logger.error(`export sweep failed: ${String(e)}`);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.worker?.close();
    await this.queue?.close();
    await this.connection?.quit().catch(() => this.connection?.disconnect());
  }
}
