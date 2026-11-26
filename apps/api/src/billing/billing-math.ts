import { Prisma } from '@prisma/client';
import type { SystemLine } from '../accounting/posting';

type Dec = Prisma.Decimal;
const zero = () => new Prisma.Decimal(0);

/**
 * Invoice journal (T-72, T-75): the customer owes the total (debit receivable); the tax is owed to
 * the tax authority; revenue (total without tax) is split between labour and parts in proportion
 * to their line amounts (so a discount is shared), 2 decimals half up, labour taking the rest.
 */
export function invoiceLines(
  a: { total: Dec; tax: Dec; partsSubtotal?: Dec; subtotal?: Dec },
  acc: { receivable: string; revenue: string; partsRevenue?: string | null; tax: string | null },
  label: string,
): SystemLine[] {
  if (a.tax.greaterThan(0) && !acc.tax) throw new Error('tax without a tax payable account');
  const revenue = a.total.minus(a.tax);
  const parts =
    a.partsSubtotal && a.subtotal && a.subtotal.greaterThan(0)
      ? revenue.mul(a.partsSubtotal).div(a.subtotal).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
      : zero();
  if (parts.greaterThan(0) && !acc.partsRevenue) throw new Error('parts without a parts revenue account');
  return [
    { accountId: acc.receivable, debit: a.total, credit: zero(), description: label },
    ...(revenue.minus(parts).greaterThan(0)
      ? [{ accountId: acc.revenue, debit: zero(), credit: revenue.minus(parts), description: label }]
      : []),
    ...(parts.greaterThan(0)
      ? [{ accountId: acc.partsRevenue!, debit: zero(), credit: parts, description: label }]
      : []),
    ...(a.tax.greaterThan(0)
      ? [{ accountId: acc.tax!, debit: zero(), credit: a.tax, description: label }]
      : []),
  ];
}

/** Payment journal: money in (cash, card clearing or bank) against the customer's receivable. */
export function paymentLines(
  amount: Dec,
  acc: { money: string; receivable: string },
  label: string,
): SystemLine[] {
  return [
    { accountId: acc.money, debit: amount, credit: zero(), description: label },
    { accountId: acc.receivable, debit: zero(), credit: amount, description: label },
  ];
}

/** Credit note journal: the invoice journal's lines with debit and credit swapped. */
export function reversedLines(lines: SystemLine[], label: string): SystemLine[] {
  return lines.map((l) => ({ accountId: l.accountId, debit: l.credit, credit: l.debit, description: label }));
}

/** What is still owed on an invoice. */
export const balanceOf = (total: Dec, payments: Dec[]) => payments.reduce((b, p) => b.minus(p), total);
