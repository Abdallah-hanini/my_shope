import {
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
