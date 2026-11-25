# Accounting posting matrix
Illustrative accrual/perpetual inventory baseline; accountant must approve recognition, chart, costing, tax and payroll mappings before live use. Dr = debit; Cr = credit. Taxes omitted below; add configured effective-dated tax lines where applicable.
| Event | Dr | Cr |
|---|---|---|
| Accepted purchase receipt | Inventory | Goods received not invoiced |
| Matched supplier invoice | GRNI (plus approved variance) | Payables |
| Supplier payment | Payables | Bank |
| Retail invoice | Receivable | Sales revenue |
| Retail stock issue | COGS | Inventory |
| Workshop part consumption | WIP | Inventory |
| Recognized direct labor | WIP or labor expense per policy | Labor clearing |
| Workshop completion/invoice per recognition policy | Receivable | Service/parts revenue |
| Recognize job cost | COGS | WIP |
| Customer receipt | Cash/bank/clearing | Receivable |
| Customer deposit | Cash/bank | Customer advances |
| Apply deposit | Customer advances | Receivable |
| Credit note | Sales returns | Receivable/refund liability |
| Accepted resalable return | Inventory | COGS |
| Refund | Refund liability/customer credit | Cash/bank |
| Stock write-off | Inventory loss | Inventory |
| Payroll accrual | Payroll expense or approved allocation | Payroll liabilities |
| Payroll payment | Payroll liabilities | Bank |
| Depreciation | Depreciation expense | Accumulated depreciation |
Same legal entity transfer: no revenue; track in-transit stock; intercompany needs separate policy. Reservation has no journal. Avoid double recognition at invoicing/payment. Handle partial receipt/invoice, price variances, non-resalable returns, chargebacks, FX, rounding and reversals explicitly. Unique source/event posting key; balance in base currency; closed periods reject posting. Job gross profit = recognized revenue less recognized direct parts/labor/consumable/outsourced cost; overhead separately allocated if approved. Reconcile GL to inventory, receivables, payables, payroll and cash daily and at close.
