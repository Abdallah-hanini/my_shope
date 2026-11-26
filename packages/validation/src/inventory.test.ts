import {
  addJobPartSchema,
  partPriceSchema,
  adjustStockSchema,
  createPartSchema,
  quantitySchema,
  receiveStockSchema,
} from './inventory';

const u = '00000000-0000-4000-8000-000000000001';
describe('parts and stock', () => {
  it('SKUs are upper case; quantities have up to 3 decimals', () => {
    expect(
      createPartSchema.parse({ sku: ' oil-5w30/4l ', name: 'Engine oil 5W-30 4 L', unit: 'each' }).sku,
    ).toBe('OIL-5W30/4L');
    expect(createPartSchema.safeParse({ sku: 'A B', name: 'x', unit: 'each' }).success).toBe(false);
    expect(quantitySchema.safeParse('4.5').success).toBe(true);
    expect(quantitySchema.safeParse('0').success).toBe(false);
    expect(quantitySchema.safeParse('1.2345').success).toBe(false);
  });
  it('receipts need a supplier reference; found stock needs a cost; adjustments need a reason', () => {
    expect(
      receiveStockSchema.safeParse({
        branchId: u,
        quantity: '10',
        unitCost: '12.5',
        reference: '',
        idempotencyKey: u,
      }).success,
    ).toBe(false);
    expect(
      receiveStockSchema.safeParse({
        branchId: u,
        quantity: '10',
        unitCost: '12.5',
        reference: 'DN-1',
        idempotencyKey: u,
      }).success,
    ).toBe(true);
    expect(
      adjustStockSchema.safeParse({
        branchId: u,
        direction: 'in',
        quantity: '1',
        reason: 'Found on shelf',
        idempotencyKey: u,
      }).success,
    ).toBe(false);
    expect(
      adjustStockSchema.safeParse({
        branchId: u,
        direction: 'out',
        quantity: '1',
        reason: 'Damaged',
        idempotencyKey: u,
      }).success,
    ).toBe(true);
    expect(
      adjustStockSchema.safeParse({
        branchId: u,
        direction: 'out',
        quantity: '1',
        reason: '',
        idempotencyKey: u,
      }).success,
    ).toBe(false);
  });
});

describe('parts on jobs', () => {
  it('prices are positive with 2 decimals or cleared; job parts need a quantity', () => {
    expect(partPriceSchema.safeParse({ version: 1, salePrice: '45.50' }).success).toBe(true);
    expect(partPriceSchema.safeParse({ version: 1, salePrice: null }).success).toBe(true);
    expect(partPriceSchema.safeParse({ version: 1, salePrice: '0' }).success).toBe(false);
    expect(addJobPartSchema.safeParse({ partId: u, quantity: '4.5' }).success).toBe(true);
    expect(addJobPartSchema.safeParse({ partId: u, quantity: '0' }).success).toBe(false);
  });
});
