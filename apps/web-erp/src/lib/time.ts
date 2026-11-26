/** Offset of `timeZone` from UTC at `utcMs`, in minutes (e.g. +180 for Asia/Qatar). */
function offsetMinutes(utcMs: number, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(new Date(utcMs))
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(
    +parts.year!,
    +parts.month! - 1,
    +parts.day!,
    +parts.hour!,
    +parts.minute!,
    +parts.second!,
  );
  return Math.round((asUtc - utcMs) / 60000);
}

/**
 * A wall-clock time typed in a datetime-local field ("2026-11-27T16:30"), read in the company's
 * time zone, as an ISO instant. Returns null for anything else.
 */
export function zonedLocalToIso(local: string, timeZone: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return null;
  const guess = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!);
  let utc = guess - offsetMinutes(guess, timeZone) * 60000;
  utc = guess - offsetMinutes(utc, timeZone) * 60000; // settle across a DST change
  return new Date(utc).toISOString();
}

/** The reverse, for a datetime-local field's default value. */
export function isoToZonedLocal(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return '';
  const ms = Date.parse(iso);
  return new Date(ms + offsetMinutes(ms, timeZone) * 60000).toISOString().slice(0, 16);
}
