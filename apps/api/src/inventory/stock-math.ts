import { Prisma } from '@prisma/client';

/**
 * Weighted average stock arithmetic (D-06, T-74). A branch's stock of a part is a quantity and a
 * value; the average cost is value ÷ quantity. Receipts and found stock add quantity × unit cost
 * (2 decimals, half up). Stock out takes quantity × average (2 decimals, half up), and the last
 * units take exactly the remaining value, so no value is left without quantity.
 */
const D = Prisma.Decimal;
type Dec = Prisma.Decimal;
const r2 = (d: Dec) => d.toDecimalPlaces(2, D.ROUND_HALF_UP);

export interface StockLevel {
  onHand: Dec;
  value: Dec;
}
export interface StockChange {
  movementValue: Dec;
  unitCost: Dec;
  after: StockLevel;
}

export function stockIn(level: StockLevel, quantity: Dec, unitCost: Dec): StockChange {
  const movementValue = r2(quantity.mul(unitCost));
  return {
    movementValue,
    unitCost,
    after: { onHand: level.onHand.plus(quantity), value: level.value.plus(movementValue) },
  };
}

/** Throws when more is taken than is on hand (no negative stock). */
export function stockOut(level: StockLevel, quantity: Dec): StockChange {
  if (quantity.greaterThan(level.onHand)) throw new RangeError('not enough stock');
  const all = quantity.equals(level.onHand);
  const movementValue = all ? level.value : r2(level.value.mul(quantity).div(level.onHand));
  return {
    movementValue,
    unitCost: averageCost(level) ?? new D(0),
    after: { onHand: level.onHand.minus(quantity), value: all ? new D(0) : level.value.minus(movementValue) },
  };
}

/** Average cost per unit (4 decimals), or null with nothing on hand. */
export function averageCost(level: StockLevel): Dec | null {
  return level.onHand.greaterThan(0)
    ? level.value.div(level.onHand).toDecimalPlaces(4, D.ROUND_HALF_UP)
    : null;
}
