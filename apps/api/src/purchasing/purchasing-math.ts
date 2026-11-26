import { Prisma } from '@prisma/client';
import type { SystemLine } from '../accounting/posting';

type Dec = Prisma.Decimal;
const D = Prisma.Decimal;
const zero = () => new D(0);

export interface BillTotals {
  receiptsValue: Dec;
  netAmount: Dec;
  varianceAmount: Dec;
  taxAmount: Dec;
  total: Dec;
}

/**
 * Supplier bill totals (T-76): the receipts' stock value, what the supplier bills before tax, the
 * difference (price variance), tax on the billed amount (2 decimals half up) and the total owed.
 */
export function billTotals(lines: { receiptValue: Dec; amount: Dec }[], taxPct: Dec | null): BillTotals {
  const receiptsValue = lines.reduce((s, l) => s.plus(l.receiptValue), zero());
  const netAmount = lines.reduce((s, l) => s.plus(l.amount), zero());
  const taxAmount = taxPct ? netAmount.mul(taxPct).div(100).toDecimalPlaces(2, D.ROUND_HALF_UP) : zero();
  return {
    receiptsValue,
    netAmount,
    varianceAmount: netAmount.minus(receiptsValue),
    taxAmount,
    total: netAmount.plus(taxAmount),
  };
}

/**
 * Bill journal: clear goods received not invoiced at the receipts' value; a higher bill is a price
 * variance expense (debit), a lower one a credit to it; recoverable input tax (debit); the supplier
 * is owed the total (credit payables).
 */
export function billJournalLines(
  t: BillTotals,
  acc: { goodsReceived: string; payables: string; inputTax: string | null; priceVariance: string | null },
  label: string,
): SystemLine[] {
  if (t.taxAmount.greaterThan(0) && !acc.inputTax) throw new Error('tax without an input tax account');
  if (!t.varianceAmount.isZero() && !acc.priceVariance) throw new Error('variance without an account');
  const v = t.varianceAmount;
  return [
    { accountId: acc.goodsReceived, debit: t.receiptsValue, credit: zero(), description: label },
    ...(v.greaterThan(0)
      ? [{ accountId: acc.priceVariance!, debit: v, credit: zero(), description: label }]
      : []),
    ...(t.taxAmount.greaterThan(0)
      ? [{ accountId: acc.inputTax!, debit: t.taxAmount, credit: zero(), description: label }]
      : []),
    ...(v.lessThan(0)
      ? [{ accountId: acc.priceVariance!, debit: zero(), credit: v.negated(), description: label }]
      : []),
    { accountId: acc.payables, debit: zero(), credit: t.total, description: label },
  ];
}

/** Supplier payment journal: the payable is settled from cash or the bank. */
export function supplierPaymentLines(
  amount: Dec,
  acc: { payables: string; money: string },
  label: string,
): SystemLine[] {
  return [
    { accountId: acc.payables, debit: amount, credit: zero(), description: label },
    { accountId: acc.money, debit: zero(), credit: amount, description: label },
  ];
}

/** Due date: the supplier's invoice date plus the payment terms (calendar days). */
export function dueDate(billDate: string, termsDays: number): string {
  const d = new Date(`${billDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + termsDays);
  return d.toISOString().slice(0, 10);
}
