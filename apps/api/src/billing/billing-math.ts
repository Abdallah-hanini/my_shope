import { Prisma } from '@prisma/client';
import type { SystemLine } from '../accounting/posting';

type Dec = Prisma.Decimal;
const zero = () => new Prisma.Decimal(0);

/**
 * Invoice journal (T-72): the customer owes the total (debit receivable); revenue is the total
 * without tax; the tax is owed to the tax authority (credit the tax code's payable account).
 */
export function invoiceLines(
  a: { total: Dec; tax: Dec },
  acc: { receivable: string; revenue: string; tax: string | null },
  label: string,
): SystemLine[] {
  if (a.tax.greaterThan(0) && !acc.tax) throw new Error('tax without a tax payable account');
  return [
    { accountId: acc.receivable, debit: a.total, credit: zero(), description: label },
    { accountId: acc.revenue, debit: zero(), credit: a.total.minus(a.tax), description: label },
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
