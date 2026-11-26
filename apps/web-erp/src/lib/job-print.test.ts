import type { JobCard } from '@erp/api-client';
import { handoverFacts } from './job-print';

type Ev = JobCard['events'][number];
type Status = JobCard['status'];

const ev = (kind: Ev['kind'], actorName: string): Ev => ({
  id: kind + actorName,
  occurredAt: '2026-11-28T10:00:00Z',
  actorName,
  kind,
  fromStatus: null,
  toStatus: null,
  note: null,
});
const addition = (seq: number, status: string) => ({ id: `a${seq}`, seq, status }) as never;

describe('handover sheet facts', () => {
  it('is available only once the job is ready or delivered', () => {
    for (const status of ['in_progress', 'qc', 'rework', 'cancelled'] as Status[])
      expect(handoverFacts({ status, events: [], additions: [] }).available).toBe(false);
    expect(handoverFacts({ status: 'ready', events: [], additions: [] }).available).toBe(true);
    expect(handoverFacts({ status: 'delivered', events: [], additions: [] }).available).toBe(true);
  });

  it('shows the latest passed check and only declined recommendations', () => {
    const f = handoverFacts({
      status: 'delivered',
      events: [ev('qc_fail', 'Sara'), ev('qc_pass', 'Sara'), ev('note', 'Ali')],
      additions: [addition(1, 'approved'), addition(2, 'declined'), addition(3, 'withdrawn')],
    });
    expect(f.qc?.actorName).toBe('Sara');
    expect(f.declined.map((a: { seq: number }) => a.seq)).toEqual([2]);
    expect(handoverFacts({ status: 'ready', events: [ev('qc_fail', 'Sara')], additions: [] }).qc).toBeNull();
  });
});
