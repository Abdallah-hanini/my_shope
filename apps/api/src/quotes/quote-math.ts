import { Prisma } from '@prisma/client';

/**
 * Quote arithmetic (T-71). Decimal throughout, 2 decimals, half up at each defined step:
 * line = override, else hours × rate; discount = subtotal × % ; net = subtotal − discount;
 * tax on the net amount: added when prices exclude tax, extracted (net × r ÷ (100 + r)) when they
 * include it; no tax code → no tax.
 */
const D = Prisma.Decimal;
type Dec = Prisma.Decimal;
const r2 = (d: Dec) => d.toDecimalPlaces(2, D.ROUND_HALF_UP);

export interface QuoteLineInput {
  hours: Dec;
  rate: Dec;
  override: Dec | null;
}
export interface QuoteTotals {
  lines: Dec[];
  subtotal: Dec;
  discount: Dec;
  net: Dec;
  tax: Dec;
  total: Dec;
}

export function quoteTotals(
  lines: QuoteLineInput[],
  discountPct: Dec,
  taxPct: Dec | null,
  pricesIncludeTax: boolean,
): QuoteTotals {
  const amounts = lines.map((l) => (l.override !== null ? r2(l.override) : r2(l.hours.mul(l.rate))));
  const subtotal = amounts.reduce((s, a) => s.plus(a), new D(0));
  const discount = r2(subtotal.mul(discountPct).div(100));
  const net = subtotal.minus(discount);
  if (taxPct === null || taxPct.isZero())
    return { lines: amounts, subtotal, discount, net, tax: new D(0), total: net };
  if (pricesIncludeTax) {
    const tax = r2(net.mul(taxPct).div(taxPct.plus(100)));
    return { lines: amounts, subtotal, discount, net, tax, total: net };
  }
  const tax = r2(net.mul(taxPct).div(100));
  return { lines: amounts, subtotal, discount, net, tax, total: net.plus(tax) };
}
