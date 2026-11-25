import { createServer, type Server } from 'node:http';

export interface WorkerState {
  startedAt: Date;
  lastHeartbeatAt: Date | null;
  heartbeatMs: number;
  queueReachable: () => Promise<boolean>;
  workerRunning: () => boolean;
}

export interface WorkerHealth {
  status: 'up' | 'down';
  checkedAt: string;
  checks: { name: 'queue' | 'consumer' | 'heartbeat'; status: 'up' | 'down'; detail?: string }[];
}

/** Heartbeat is stale after three missed intervals; a fresh worker is given that long to process one. */
export async function evaluate(state: WorkerState, now: Date = new Date()): Promise<WorkerHealth> {
  const staleAfter = state.heartbeatMs * 3;
  const reference = state.lastHeartbeatAt ?? state.startedAt;
  const heartbeatFresh = now.getTime() - reference.getTime() <= staleAfter;
  const queue = await state.queueReachable().catch(() => false);
  const checks: WorkerHealth['checks'] = [
    { name: 'queue', status: queue ? 'up' : 'down' },
    { name: 'consumer', status: state.workerRunning() ? 'up' : 'down' },
    {
      name: 'heartbeat',
      status: heartbeatFresh ? 'up' : 'down',
      detail: state.lastHeartbeatAt
        ? `last ${state.lastHeartbeatAt.toISOString()}`
        : 'awaiting first heartbeat',
    },
  ];
  return {
    status: checks.every((c) => c.status === 'up') ? 'up' : 'down',
    checkedAt: now.toISOString(),
    checks,
  };
}

export function startHealthServer(port: number, state: WorkerState): Server {
  const server = createServer((req, res) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify(body));
    };
    if (req.method === 'GET' && req.url === '/health/live') return send(200, { status: 'up' });
    if (req.method === 'GET' && req.url === '/health/ready') {
      evaluate(state).then(
        (h) => send(h.status === 'up' ? 200 : 503, h),
        () => send(503, { status: 'down' }),
      );
      return;
    }
    send(404, { type: 'about:blank', title: 'Not Found', status: 404, instance: req.url ?? '' });
  });
  server.listen(port);
  return server;
}
