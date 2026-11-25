import pino from 'pino';
import { JOBS } from '../src/queues';
import { startWorker, type StartedWorker } from '../src/worker';

// Real Redis (queue instance). Requires REDIS_QUEUE_URL.
const url = process.env.REDIS_QUEUE_URL;

describe('worker (integration)', () => {
  let w: StartedWorker;

  beforeAll(async () => {
    if (!url) throw new Error('REDIS_QUEUE_URL is required for worker integration tests');
    w = await startWorker({ redisUrl: url, heartbeatMs: 1000, logger: pino({ level: 'silent' }) });
  });
  afterAll(async () => {
    await w.queue.obliterate({ force: true });
    await w.close();
  });

  it('processes a heartbeat job and records the time', async () => {
    const job = await w.queue.add(JOBS.heartbeat, {});
    const done = await new Promise<unknown>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('heartbeat not processed in time')), 10000);
      w.worker.on('completed', (j, result) => {
        if (j.id === job.id) {
          clearTimeout(t);
          resolve(result);
        }
      });
    });
    expect(done).toHaveProperty('at');
    expect(w.state.lastHeartbeatAt).toBeInstanceOf(Date);
  });

  it('fails unknown jobs loudly instead of dropping them', async () => {
    const job = await w.queue.add('not-a-real-job', {});
    const err = await new Promise<Error>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('job did not fail in time')), 10000);
      w.worker.on('failed', (j, e) => {
        if (j?.id === job.id) {
          clearTimeout(t);
          resolve(e);
        }
      });
    });
    expect(err.message).toMatch(/Unknown job/);
  });
});
