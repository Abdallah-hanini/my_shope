import { evaluate, type WorkerState } from './health';

const base = (over: Partial<WorkerState> = {}): WorkerState => ({
  startedAt: new Date('2026-01-01T00:00:00Z'),
  lastHeartbeatAt: null,
  heartbeatMs: 1000,
  queueReachable: async () => true,
  workerRunning: () => true,
  ...over,
});

describe('worker readiness', () => {
  it('is up during the start-up grace period before the first heartbeat', async () => {
    const h = await evaluate(base(), new Date('2026-01-01T00:00:02Z'));
    expect(h.status).toBe('up');
  });

  it('is down when no heartbeat has been processed after three intervals', async () => {
    const h = await evaluate(base(), new Date('2026-01-01T00:00:04Z'));
    expect(h.status).toBe('down');
    expect(h.checks.find((c) => c.name === 'heartbeat')?.status).toBe('down');
  });

  it('is up with a recent heartbeat', async () => {
    const h = await evaluate(
      base({ lastHeartbeatAt: new Date('2026-01-01T00:10:00Z') }),
      new Date('2026-01-01T00:10:01Z'),
    );
    expect(h.status).toBe('up');
  });

  it('is down when the queue is unreachable, even if the probe throws', async () => {
    const h = await evaluate(
      base({
        queueReachable: async () => {
          throw new Error('ECONNREFUSED');
        },
      }),
      new Date('2026-01-01T00:00:01Z'),
    );
    expect(h.checks.find((c) => c.name === 'queue')?.status).toBe('down');
    expect(h.status).toBe('down');
  });

  it('is down when the consumer stopped', async () => {
    const h = await evaluate(base({ workerRunning: () => false }), new Date('2026-01-01T00:00:01Z'));
    expect(h.status).toBe('down');
  });
});
