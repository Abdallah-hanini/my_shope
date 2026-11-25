import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import type { Logger } from 'pino';
import { JOBS, QUEUES } from './queues';

export interface StartedWorker {
  queue: Queue;
  worker: Worker;
  connection: IORedis;
  state: { lastHeartbeatAt: Date | null };
  close: () => Promise<void>;
}

export async function startWorker(opts: {
  redisUrl: string;
  heartbeatMs: number;
  logger: Logger;
}): Promise<StartedWorker> {
  // BullMQ requires maxRetriesPerRequest=null on worker connections.
  const connection = new IORedis(opts.redisUrl, { maxRetriesPerRequest: null, connectionName: 'erp-worker' });
  connection.on('error', (err) => opts.logger.warn({ err: err.message }, 'queue redis error'));
  const state: StartedWorker['state'] = { lastHeartbeatAt: null };

  const queue = new Queue(QUEUES.system, { connection });
  await queue.upsertJobScheduler(
    'system-heartbeat',
    { every: opts.heartbeatMs },
    { name: JOBS.heartbeat, opts: { removeOnComplete: 100, removeOnFail: 500 } },
  );

  const worker = new Worker(
    QUEUES.system,
    async (job) => {
      if (job.name !== JOBS.heartbeat) {
        // Unknown jobs fail loudly and stay in the failed set for inspection (no silent drops).
        throw new Error(`Unknown job "${job.name}" on queue ${QUEUES.system}`);
      }
      state.lastHeartbeatAt = new Date();
      return { at: state.lastHeartbeatAt.toISOString() };
    },
    { connection, concurrency: 1 },
  );
  worker.on('failed', (job, err) =>
    opts.logger.error({ jobId: job?.id, name: job?.name, err: err.message }, 'job failed'),
  );

  return {
    queue,
    worker,
    connection,
    state,
    close: async () => {
      await worker.close();
      await queue.close();
      await connection.quit();
    },
  };
}
