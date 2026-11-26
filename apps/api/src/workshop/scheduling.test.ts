import { daySlots, localTime, peakOverlap, timeProblem, zonedInstant, type Schedule } from './scheduling';

const TZ = 'Asia/Qatar'; // UTC+3, no daylight saving
const at = (iso: string) => new Date(iso);
// Saturday 2026-12-05 opens 08:00–17:00; Friday closed.
const s: Schedule = {
  bays: 2,
  slotMinutes: 30,
  hours: [{ weekday: 6, opensMinute: 480, closesMinute: 1020 }],
};

describe('workshop scheduling', () => {
  it('converts between local wall-clock time and instants', () => {
    expect(zonedInstant('2026-12-05', 480, TZ).toISOString()).toBe('2026-12-05T05:00:00.000Z');
    expect(localTime(at('2026-12-05T05:00:00Z'), TZ)).toEqual({
      date: '2026-12-05',
      weekday: 6,
      minute: 480,
    });
    expect(zonedInstant('2026-07-01', 540, 'Europe/London').toISOString()).toBe('2026-07-01T08:00:00.000Z');
  });

  it('accepts times inside opening hours on the slot grid, and explains the rest', () => {
    const t = (start: string, minutes: number) =>
      timeProblem(s, at(start), new Date(at(start).getTime() + minutes * 60000), TZ);
    expect(t('2026-12-05T05:00:00Z', 60)).toBeNull(); // 08:00–09:00
    expect(t('2026-12-05T13:30:00Z', 30)).toBeNull(); // 16:30–17:00 ends at closing
    expect(t('2026-12-04T05:00:00Z', 60)).toMatch(/closed/); // Friday
    expect(t('2026-12-05T04:30:00Z', 60)).toMatch(/Outside opening hours \(08:00–17:00\)/);
    expect(t('2026-12-05T13:30:00Z', 60)).toMatch(/Outside opening hours/);
    expect(t('2026-12-05T05:10:00Z', 30)).toMatch(/30-minute grid/);
    expect(t('2026-12-05T05:00:00Z', 45)).toMatch(/multiple of 30/);
  });

  it('counts the peak of simultaneous bookings, not every overlap', () => {
    const iv = (a: string, b: string) => ({
      start: at(`2026-12-05T${a}:00Z`),
      end: at(`2026-12-05T${b}:00Z`),
    });
    const long = iv('05:00', '08:00');
    // Two back-to-back bookings overlap the long one but never each other: peak 2, not 3.
    expect(
      peakOverlap(
        [long, iv('05:00', '06:00'), iv('06:00', '07:00')],
        at('2026-12-05T05:00:00Z'),
        at('2026-12-05T08:00:00Z'),
      ),
    ).toBe(2);
    expect(peakOverlap([iv('05:00', '06:00')], at('2026-12-05T06:00:00Z'), at('2026-12-05T07:00:00Z'))).toBe(
      0,
    ); // touching
  });

  it('lists the day’s slots with free bays; a closed day has none', () => {
    const slots = daySlots(s, '2026-12-05', TZ, [
      { start: at('2026-12-05T05:00:00Z'), end: at('2026-12-05T06:00:00Z') },
    ]);
    expect(slots).toHaveLength(18);
    expect(slots.slice(0, 3).map((x) => [x.start.toISOString().slice(11, 16), x.booked, x.free])).toEqual([
      ['05:00', 1, 1],
      ['05:30', 1, 1],
      ['06:00', 0, 2],
    ]);
    expect(daySlots(s, '2026-12-04', TZ, [])).toEqual([]);
  });
});
