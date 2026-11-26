/**
 * Appointment time rules (WMS-002), pure. Opening hours are wall-clock minutes in the company's
 * time zone; instants are stored in UTC.
 */
export interface Hours {
  weekday: number; // 0 = Sunday
  opensMinute: number;
  closesMinute: number;
}
export interface Schedule {
  bays: number;
  slotMinutes: number;
  hours: Hours[];
}
export interface Interval {
  start: Date;
  end: Date;
}

function parts(utcMs: number, timeZone: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
    })
      .formatToParts(new Date(utcMs))
      .map((x) => [x.type, x.value]),
  );
  return p as Record<string, string>;
}

/** Local calendar date, weekday and minute-of-day of an instant in `timeZone`. */
export function localTime(at: Date, timeZone: string): { date: string; weekday: number; minute: number } {
  const p = parts(at.getTime(), timeZone);
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday!);
  return { date: `${p.year}-${p.month}-${p.day}`, weekday, minute: Number(p.hour) * 60 + Number(p.minute) };
}

function offsetMs(utcMs: number, timeZone: string): number {
  const p = parts(utcMs, timeZone);
  return (
    Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!, +p.second!) -
    Math.floor(utcMs / 1000) * 1000
  );
}

/** The instant of a local date + minute-of-day in `timeZone`. */
export function zonedInstant(date: string, minute: number, timeZone: string): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const guess = Date.UTC(y, m - 1, d, 0, minute);
  let utc = guess - offsetMs(guess, timeZone);
  utc = guess - offsetMs(utc, timeZone);
  return new Date(utc);
}

/** Why an appointment cannot be at this time, or null if the time fits the workshop's hours. */
export function timeProblem(s: Schedule, start: Date, end: Date, timeZone: string): string | null {
  const a = localTime(start, timeZone);
  const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
  const day = s.hours.find((h) => h.weekday === a.weekday);
  if (!day) return 'The workshop is closed on that day';
  if (a.minute % s.slotMinutes !== 0 || start.getUTCSeconds() !== 0) {
    return `Appointments start on the ${s.slotMinutes}-minute grid`;
  }
  if (minutes <= 0 || minutes % s.slotMinutes !== 0)
    return `The length must be a multiple of ${s.slotMinutes} minutes`;
  if (a.minute < day.opensMinute || a.minute + minutes > day.closesMinute) {
    return `Outside opening hours (${clock(day.opensMinute)}–${clock(day.closesMinute)})`;
  }
  return null;
}

export const clock = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

/** The most intervals in use at the same moment within [from, to). Touching ends do not overlap. */
export function peakOverlap(intervals: Interval[], from: Date, to: Date): number {
  const points: [number, number][] = [];
  for (const i of intervals) {
    const s = Math.max(i.start.getTime(), from.getTime());
    const e = Math.min(i.end.getTime(), to.getTime());
    if (s < e) points.push([s, 1], [e, -1]);
  }
  points.sort((x, y) => x[0] - y[0] || x[1] - y[1]); // ends before starts at the same instant
  let cur = 0;
  let peak = 0;
  for (const [, d] of points) {
    cur += d;
    peak = Math.max(peak, cur);
  }
  return peak;
}

export interface Slot {
  start: Date;
  end: Date;
  booked: number;
  free: number;
}

/** Slots of a local day with how many bays are booked in each (empty when closed). */
export function daySlots(s: Schedule, date: string, timeZone: string, booked: Interval[]): Slot[] {
  const noon = zonedInstant(date, 12 * 60, timeZone);
  const day = s.hours.find((h) => h.weekday === localTime(noon, timeZone).weekday);
  if (!day) return [];
  const out: Slot[] = [];
  for (let m = day.opensMinute; m < day.closesMinute; m += s.slotMinutes) {
    const start = zonedInstant(date, m, timeZone);
    const end = zonedInstant(date, m + s.slotMinutes, timeZone);
    const n = peakOverlap(booked, start, end);
    out.push({ start, end, booked: n, free: Math.max(0, s.bays - n) });
  }
  return out;
}
