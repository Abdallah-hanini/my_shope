import { isoToZonedLocal, zonedLocalToIso } from './time';

describe('company-time conversion', () => {
  it('reads wall-clock times in the company time zone', () => {
    expect(zonedLocalToIso('2026-11-27T16:30', 'Asia/Qatar')).toBe('2026-11-27T13:30:00.000Z');
    expect(zonedLocalToIso('2026-07-01T09:00', 'Europe/London')).toBe('2026-07-01T08:00:00.000Z'); // summer time
    expect(zonedLocalToIso('2026-01-01T09:00', 'Europe/London')).toBe('2026-01-01T09:00:00.000Z');
    expect(zonedLocalToIso('tomorrow', 'Asia/Qatar')).toBeNull();
  });

  it('round-trips for form defaults', () => {
    expect(isoToZonedLocal('2026-11-27T13:30:00.000Z', 'Asia/Qatar')).toBe('2026-11-27T16:30');
    expect(isoToZonedLocal(null, 'Asia/Qatar')).toBe('');
  });
});
