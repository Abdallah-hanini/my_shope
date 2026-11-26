import {
  createBaySchema,
  decideAdditionSchema,
  proposeAdditionSchema,
  labourReportQuerySchema,
  manualTimeEntrySchema,
  voidTimeEntrySchema,
  createCustomerSchema,
  createJobSchema,
  createVehicleSchema,
  plateSchema,
  qcResultSchema,
  vinSchema,
} from './workshop';

describe('workshop schemas', () => {
  it('normalises plates and accepts Arabic letters; rejects junk', () => {
    expect(plateSchema.parse('  12345 ')).toBe('12345');
    expect(plateSchema.parse('ab  123')).toBe('AB 123');
    expect(plateSchema.parse('أ ب 123')).toBe('أ ب 123');
    expect(plateSchema.safeParse('!!').success).toBe(false);
    expect(plateSchema.safeParse('x'.repeat(21)).success).toBe(false);
  });

  it('VIN: 17 characters without I, O or Q', () => {
    expect(vinSchema.parse('1hgcm82633a004352')).toBe('1HGCM82633A004352');
    expect(vinSchema.safeParse('1HGCM82633A00435').success).toBe(false);
    expect(vinSchema.safeParse('1HGCM82633A0O4352').success).toBe(false);
  });

  it('customers need a name and a phone; empty email becomes null', () => {
    expect(createCustomerSchema.parse({ name: 'Ali', phone: '+974 5555 1234', email: '' })).toMatchObject({
      kind: 'individual',
      email: null,
    });
    expect(createCustomerSchema.safeParse({ name: 'Ali', phone: 'call me' }).success).toBe(false);
  });

  it('vehicles: optional VIN, plausible year', () => {
    const v = {
      customerId: '11111111-1111-4111-8111-111111111111',
      plate: 'a 1',
      make: 'Toyota',
      model: 'Land Cruiser',
    };
    expect(createVehicleSchema.parse({ ...v, vin: '', year: '2020' })).toMatchObject({
      plate: 'A 1',
      vin: null,
      year: 2020,
    });
    expect(createVehicleSchema.safeParse({ ...v, year: 1900 }).success).toBe(false);
  });

  it('a job card needs a complaint, odometer, fuel level and at least one task with hours', () => {
    const base = {
      branchId: '11111111-1111-4111-8111-111111111111',
      vehicleId: '22222222-2222-4222-8222-222222222222',
      complaint: 'Brakes squeal',
      odometerIn: '120500',
      fuelLevel: 'half',
    };
    expect(
      createJobSchema.parse({
        ...base,
        tasks: [{ description: 'Replace front pads', estimatedHours: '1.5' }],
      }).odometerIn,
    ).toBe(120500);
    expect(createJobSchema.safeParse({ ...base, tasks: [] }).success).toBe(false);
    expect(
      createJobSchema.safeParse({ ...base, tasks: [{ description: 'x', estimatedHours: '0' }] }).success,
    ).toBe(false);
    expect(
      createJobSchema.safeParse({ ...base, tasks: [{ description: 'x', estimatedHours: '1.555' }] }).success,
    ).toBe(false);
  });

  it('a failed quality check needs a note and the tasks to redo', () => {
    expect(qcResultSchema.safeParse({ result: 'pass', version: 3 }).success).toBe(true);
    expect(
      qcResultSchema.safeParse({ result: 'fail', version: 3, note: 'noise remains', reopenTaskIds: [] })
        .success,
    ).toBe(false);
    expect(
      qcResultSchema.safeParse({
        result: 'fail',
        version: 3,
        reopenTaskIds: ['11111111-1111-4111-8111-111111111111'],
      }).success,
    ).toBe(false);
  });
});

describe('check-in inspection', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const w = require('./workshop') as typeof import('./workshop');
  const all = (status: 'ok' | 'attention' | 'not_checked' = 'ok') =>
    w.INSPECTION_ITEMS.map((i) => ({ key: i.key, status }));

  it('needs every item exactly once', () => {
    expect(w.recordInspectionSchema.safeParse({ version: 1, items: all() }).success).toBe(true);
    expect(w.recordInspectionSchema.safeParse({ version: 1, items: all().slice(1) }).success).toBe(false);
    expect(
      w.recordInspectionSchema.safeParse({ version: 1, items: [...all().slice(1), all()[1]] }).success,
    ).toBe(false);
  });

  it('"needs attention" must say what', () => {
    const items = all();
    items[0] = { key: 'body', status: 'attention' };
    expect(w.recordInspectionSchema.safeParse({ version: 1, items }).success).toBe(false);
    expect(
      w.recordInspectionSchema.safeParse({
        version: 1,
        items: [{ ...items[0], note: 'Scratch on rear door' }, ...items.slice(1)],
      }).success,
    ).toBe(true);
  });

  it('photo areas are a closed list', () => {
    expect(w.photoMetaSchema.parse({ area: 'damage', caption: '' })).toEqual({
      area: 'damage',
      caption: null,
    });
    expect(w.photoMetaSchema.safeParse({ area: 'roof' }).success).toBe(false);
  });
});

describe('appointments', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const w = require('./workshop') as typeof import('./workshop');
  const sched = {
    version: 0,
    bays: 3,
    slotMinutes: 30,
    hours: [{ weekday: 6, opens: '08:00', closes: '17:00' }],
  };

  it('workshop hours: closes after opens, fits the slots, each weekday once', () => {
    expect(w.workshopScheduleSchema.safeParse(sched).success).toBe(true);
    expect(
      w.workshopScheduleSchema.safeParse({
        ...sched,
        hours: [{ weekday: 6, opens: '17:00', closes: '08:00' }],
      }).success,
    ).toBe(false);
    expect(
      w.workshopScheduleSchema.safeParse({
        ...sched,
        hours: [{ weekday: 6, opens: '08:15', closes: '17:00' }],
      }).success,
    ).toBe(false);
    expect(
      w.workshopScheduleSchema.safeParse({ ...sched, hours: [...sched.hours, ...sched.hours] }).success,
    ).toBe(false);
    expect(w.workshopScheduleSchema.safeParse({ ...sched, slotMinutes: 20 }).success).toBe(false);
    expect(w.workshopScheduleSchema.safeParse({ ...sched, bays: 0 }).success).toBe(false);
  });

  it('a booking needs an exact time with offset and a duration of 15 minutes to 8 hours', () => {
    const ok = {
      branchId: '11111111-1111-4111-8111-111111111111',
      vehicleId: '22222222-2222-4222-8222-222222222222',
      startsAt: '2026-12-01T08:00:00+03:00',
      durationMinutes: '60',
      service: 'Oil change',
    };
    expect(w.createAppointmentSchema.parse(ok).durationMinutes).toBe(60);
    expect(w.createAppointmentSchema.safeParse({ ...ok, startsAt: '2026-12-01 08:00' }).success).toBe(false);
    expect(w.createAppointmentSchema.safeParse({ ...ok, durationMinutes: 600 }).success).toBe(false);
  });
});

describe('labour time', () => {
  const u = '00000000-0000-4000-8000-000000000001';
  const entry = (startedAt: string, endedAt: string) =>
    manualTimeEntrySchema.safeParse({
      taskId: u,
      technicianId: u,
      startedAt,
      endedAt,
      reason: 'Forgot to clock',
    });
  it('manual entries end after they start, last at most 16 hours and need a reason', () => {
    expect(entry('2026-11-20T08:00:00+03:00', '2026-11-20T09:30:00+03:00').success).toBe(true);
    expect(entry('2026-11-20T09:00:00+03:00', '2026-11-20T09:00:00+03:00').success).toBe(false);
    expect(entry('2026-11-20T08:00:00+03:00', '2026-11-21T00:01:00+03:00').success).toBe(false);
    expect(
      manualTimeEntrySchema.safeParse({
        taskId: u,
        technicianId: u,
        startedAt: '2026-11-20T08:00:00Z',
        endedAt: '2026-11-20T09:00:00Z',
        reason: ' ',
      }).success,
    ).toBe(false);
    expect(voidTimeEntrySchema.safeParse({ reason: 'no' }).success).toBe(false);
  });
  it('report ranges are ordered and at most 366 days', () => {
    expect(labourReportQuerySchema.safeParse({ from: '2026-11-01', to: '2026-11-30' }).success).toBe(true);
    expect(labourReportQuerySchema.safeParse({ from: '2026-01-01', to: '2026-12-31' }).success).toBe(true);
    expect(labourReportQuerySchema.safeParse({ from: '2026-11-30', to: '2026-11-01' }).success).toBe(false);
    expect(labourReportQuerySchema.safeParse({ from: '2025-01-01', to: '2026-01-02' }).success).toBe(false);
  });
});

describe('additional work', () => {
  it('a proposal names the finding and at least one task', () => {
    const task = { description: 'Replace rear pads', estimatedHours: '1' };
    expect(
      proposeAdditionSchema.safeParse({ version: 3, finding: 'Rear pads worn to 2 mm', tasks: [task] })
        .success,
    ).toBe(true);
    expect(proposeAdditionSchema.safeParse({ version: 3, finding: 'x', tasks: [] }).success).toBe(false);
    expect(proposeAdditionSchema.safeParse({ version: 3, finding: ' ', tasks: [task] }).success).toBe(false);
  });
  it('approval names who authorised and how; a refusal needs a reason', () => {
    expect(
      decideAdditionSchema.safeParse({
        decision: 'approve',
        version: 4,
        authorizedByName: 'Noor',
        authorizedVia: 'phone',
      }).success,
    ).toBe(true);
    expect(
      decideAdditionSchema.safeParse({ decision: 'approve', version: 4, authorizedVia: 'phone' }).success,
    ).toBe(false);
    expect(decideAdditionSchema.safeParse({ decision: 'decline', version: 4, reason: '' }).success).toBe(
      false,
    );
    expect(
      decideAdditionSchema.safeParse({ decision: 'decline', version: 4, reason: 'Too expensive' }).success,
    ).toBe(true);
  });
});

describe('bays', () => {
  it('codes are short, upper case, letters, digits or "-"', () => {
    expect(createBaySchema.parse({ code: ' b1 ', name: 'Bay 1' })).toEqual({ code: 'B1', name: 'Bay 1' });
    expect(createBaySchema.safeParse({ code: 'LIFT-2', name: 'Lift 2' }).success).toBe(true);
    expect(createBaySchema.safeParse({ code: 'bay one', name: 'x' }).success).toBe(false);
    expect(createBaySchema.safeParse({ code: 'B1', name: '' }).success).toBe(false);
  });
});
