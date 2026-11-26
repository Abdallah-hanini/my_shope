import { Prisma } from '@prisma/client';

/**
 * Labour time definitions (WMS-007; docs/KPI_DICTIONARY.md "Labour time"). Pure: the service loads
 * entries and tasks; these functions do the arithmetic.
 */

export interface TimeSpan {
  startedAt: Date;
  endedAt: Date | null;
}

/** Seconds of a span, rounded half up (so any recorded time counts); open spans run to `now`. */
export function spanSeconds(s: TimeSpan, now: Date): number {
  const end = s.endedAt ?? now;
  return Math.max(0, Math.round((end.getTime() - s.startedAt.getTime()) / 1000));
}

/** Seconds → whole minutes, half up. */
export const toMinutes = (seconds: number) => Math.floor((seconds + 30) / 60);

/** Seconds → hours with 2 decimals, half up (decimal arithmetic). */
export const toHours = (seconds: number) =>
  new Prisma.Decimal(seconds).div(3600).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2);

/**
 * Efficiency % = estimated hours ÷ actual hours × 100, 1 decimal, half up. Above 100 means faster
 * than estimated. Null when no time was recorded (never shown as 0 % or infinity).
 */
export function efficiencyPct(estimatedHours: Prisma.Decimal, actualSeconds: number): string | null {
  if (actualSeconds <= 0) return null;
  return estimatedHours
    .mul(3600 * 100)
    .div(actualSeconds)
    .toDecimalPlaces(1, Prisma.Decimal.ROUND_HALF_UP)
    .toFixed(1);
}

export interface ReportEntry extends TimeSpan {
  technicianId: string;
  taskId: string;
  jobId: string;
}
export interface ReportTask {
  id: string;
  technicianId: string;
  estimatedHours: Prisma.Decimal;
}

export interface TechnicianLabour {
  technicianId: string;
  /** Closed entries that started in the range. */
  clockedSeconds: number;
  entries: number;
  jobs: number;
  /** Tasks the technician completed in the range. */
  tasksDone: number;
  /** Completed tasks without any time from the technician (left out of efficiency). */
  tasksWithoutTime: number;
  /** Estimate and the technician's own time (any date) on completed tasks that have time. */
  estimatedSeconds: number;
  actualSeconds: number;
  efficiencyPct: string | null;
}

/**
 * Per technician: `inRange` are the closed entries started in the range; `doneTasks` the tasks
 * completed in the range; `taskEntries` every closed entry on those tasks (any date).
 */
export function summarise(
  inRange: ReportEntry[],
  doneTasks: ReportTask[],
  taskEntries: ReportEntry[],
  now: Date,
): TechnicianLabour[] {
  const ids = new Set([...inRange.map((e) => e.technicianId), ...doneTasks.map((t) => t.technicianId)]);
  return [...ids].map((technicianId) => {
    const mine = inRange.filter((e) => e.technicianId === technicianId);
    const tasks = doneTasks.filter((t) => t.technicianId === technicianId);
    let estimated = new Prisma.Decimal(0);
    let actualSeconds = 0;
    let withoutTime = 0;
    for (const t of tasks) {
      const secs = taskEntries
        .filter((e) => e.taskId === t.id && e.technicianId === technicianId)
        .reduce((s, e) => s + spanSeconds(e, now), 0);
      if (secs === 0) withoutTime += 1;
      else {
        estimated = estimated.plus(t.estimatedHours);
        actualSeconds += secs;
      }
    }
    return {
      technicianId,
      clockedSeconds: mine.reduce((s, e) => s + spanSeconds(e, now), 0),
      entries: mine.length,
      jobs: new Set(mine.map((e) => e.jobId)).size,
      tasksDone: tasks.length,
      tasksWithoutTime: withoutTime,
      estimatedSeconds: estimated.mul(3600).toNumber(),
      actualSeconds,
      efficiencyPct: efficiencyPct(estimated, actualSeconds),
    };
  });
}
