import { parseEnv, workerEnvSchema } from '@erp/validation';
import pino from 'pino';
import { startHealthServer } from './health';
import { startWorker } from './worker';

async function main(): Promise<void> {
  const env = parseEnv(workerEnvSchema, process.env);
  const logger = pino({ level: env.LOG_LEVEL, name: 'erp-worker' });
  const started = await startWorker({
    redisUrl: env.REDIS_QUEUE_URL,
    heartbeatMs: env.WORKER_HEARTBEAT_MS,
    logger,
  });
  const startedAt = new Date();
  const server = startHealthServer(env.WORKER_HEALTH_PORT, {
    startedAt,
    heartbeatMs: env.WORKER_HEARTBEAT_MS,
    get lastHeartbeatAt() {
      return started.state.lastHeartbeatAt;
    },
    queueReachable: async () => (await started.connection.ping()) === 'PONG',
    workerRunning: () => started.worker.isRunning(),
  });
  logger.info({ port: env.WORKER_HEALTH_PORT }, 'worker started');

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down');
    server.close();
    await started.close();
    process.exit(0);
  };
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
