import { Prisma } from '@prisma/client';
import { efficiencyPct, spanSeconds, summarise, toHours, toMinutes } from './labour';

const at = (hhmm: string) => new Date(`2026-11-20T${hhmm}:00Z`);
const now = at('12:00');

describe('labour time arithmetic', () => {
  it('measures spans in seconds, rounded half up; open spans run to now', () => {
    expect(spanSeconds({ startedAt: at('08:00'), endedAt: at('09:30') }, now)).toBe(5400);
    expect(spanSeconds({ startedAt: at('11:15'), endedAt: null }, now)).toBe(2700);
    const t0 = at('10:00');
    expect(spanSeconds({ startedAt: t0, endedAt: new Date(t0.getTime() + 580) }, now)).toBe(1);
    expect(spanSeconds({ startedAt: t0, endedAt: new Date(t0.getTime() + 400) }, now)).toBe(0);
    expect(toMinutes(89)).toBe(1);
    expect(toMinutes(90)).toBe(2);
    expect(toHours(5400)).toBe('1.50');
    expect(toHours(1)).toBe('0.00');
  });

  it('efficiency is estimate ÷ actual, 1 decimal half up, null without time', () => {
    expect(efficiencyPct(new Prisma.Decimal('1.5'), 3600)).toBe('150.0');
    expect(efficiencyPct(new Prisma.Decimal('1'), 5400)).toBe('66.7');
    expect(efficiencyPct(new Prisma.Decimal('2'), 0)).toBeNull();
  });

  it('summarises per technician; completed tasks without time are counted but left out of efficiency', () => {
    const e = (technicianId: string, taskId: string, from: string, to: string) => ({
      technicianId,
      taskId,
      jobId: `job-${taskId}`,
      startedAt: at(from),
      endedAt: at(to),
    });
    const inRange = [
      e('ali', 't1', '08:00', '09:00'),
      e('ali', 't2', '09:00', '10:30'),
      e('sam', 't3', '08:00', '08:30'),
    ];
    const tasks = [
      { id: 't1', technicianId: 'ali', estimatedHours: new Prisma.Decimal('1.5') },
      { id: 't4', technicianId: 'ali', estimatedHours: new Prisma.Decimal('2') },
    ];
    // t1 also has 30 minutes from an earlier day, and 15 minutes by someone else (not Ali's time).
    const taskEntries = [inRange[0]!, e('ali', 't1', '07:00', '07:30'), e('sam', 't1', '10:00', '10:15')];
    const r = summarise(inRange, tasks, taskEntries, now);
    expect(r.find((x) => x.technicianId === 'ali')).toEqual({
      technicianId: 'ali',
      clockedSeconds: 9000,
      entries: 2,
      jobs: 2,
      tasksDone: 2,
      tasksWithoutTime: 1,
      estimatedSeconds: 5400,
      actualSeconds: 5400,
      efficiencyPct: '100.0',
    });
    expect(r.find((x) => x.technicianId === 'sam')).toMatchObject({
      clockedSeconds: 1800,
      tasksDone: 0,
      efficiencyPct: null,
    });
  });
});
