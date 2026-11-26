# KPI dictionary

These are the only definitions used by the web dashboard, and later by the manager app and exports. Code: `apps/api/src/reporting/kpi.ts` and `reporting.service.ts`. Data source: the view `reporting.ledger_line`, one row per posted journal line, from migration `reporting_foundation`.

Common rules:
- **Grain:** journal line.
- **Currency:** company base currency. Multi-currency and FX are not supported yet (D-07).
- **Dates:** posting dates, which are business dates.
- **Range:** from the first day of `from` to the last day of `to`. Months are calendar months, and at most 24.
- **Inclusion:** all posted journals, including reversals. A reversal nets its original, so a corrected error contributes zero.
- **Branch filter:** journals whose `branch_id` matches. Company-level journals (`branch_id` null) appear only in unfiltered, company-wide views.
- **Scope:** users whose role is limited to branches never see company-level journals or other branches. The response says `scope: "branches"`.
- **Freshness:** computed live from committed data at request time (`asOf`). All figures come from one REPEATABLE READ snapshot, so they are mutually consistent.
- **Classification:** an account counts as cash, bank or COGS only if its **reporting class** says so. Classes are set explicitly in the chart of accounts, and the database checks that they match the account type. Account names are never interpreted.

| KPI | Formula | Notes |
|---|---|---|
| Revenue | Σ(credit − debit) over revenue-type accounts | Net of returns and discounts once those post to revenue-type contra accounts. Tax is excluded, because tax postings use liability accounts |
| Cost of goods sold | Σ(debit − credit) over expense accounts with class `cogs` | 0 when no account is classed as COGS |
| Gross profit | Revenue − COGS | |
| Gross margin % | Gross profit ÷ Revenue × 100, 1 decimal, rounded half-up | **null when revenue = 0**, shown as "No revenue in this period", never 0% |
| Operating expenses | Σ(debit − credit) over expense accounts not classed `cogs` | |
| Net profit | Revenue − COGS − Operating expenses | Overhead allocation and tax are not included (accountant decision pending, D-04) |
| Cash and bank | Σ(debit − credit) over accounts classed `cash` or `bank`, all history up to the end of the range | When none are classed, the API raises exception `no_cash_accounts` and the UI shows "—" |
| Journals posted | Count of distinct journals in the range | Includes reversals |

Exceptions ("Needs attention"):
- `period_open_after_end`: an open fiscal period whose end date is before today, in the company time zone.
- `reversal_in_range`: reversal journals in the range (up to 10, newest first).
- `no_cash_accounts`: no account is classed as cash or bank.

Reconciliation, enforced by tests in `apps/api/test/reporting.int.test.ts`:
- The sum of branch net profits, including company-level, equals total net profit.
- The sum of monthly figures equals the totals.
- Cash carries forward across empty months.

## Ledger reports (WEB-122 trial balance, WEB-100 general ledger)

Code: `apps/api/src/reporting/ledger.ts` (pure arithmetic, unit-tested) and `ledger.service.ts`. Same view, scope, branch and freshness rules as above, with **day** ranges (`from`/`to` are dates, at most 3 years).

| Figure | Definition |
|---|---|
| Balance (signed) | Σ(debit − credit). Positive = debit balance ("Dr"), negative = credit balance ("Cr") |
| Opening | Balance of all posted lines **before** `from` (all history) |
| Period debit / credit | Σ debit and Σ credit of lines from `from` to `to` |
| Closing | Opening + period debit − period credit |
| Header account | Sum of its descendants; never counted in totals (header accounts cannot hold lines) |
| Totals | Posting accounts only. Debit totals add positive balances, credit totals add negative ones |
| Balanced | Opening, period and closing debit totals equal the credit totals. Shown as a red warning, never hidden, if not |
| Period result | Net profit formula above applied to the period movements |
| Running balance (GL) | Opening + Σ(debit − credit) of the lines up to and including this one, in (posting date, journal number, line number) order. Page 2+ starts from the balance brought forward |
| Line description | The line's own text, else the journal description |

Year-end closing is not set up (no transfer of revenue and expense to retained earnings), so revenue and expense balances accumulate from the first journal. The trial balance says so on screen (T-37).

Reconciliation, enforced by `apps/api/test/reporting.int.test.ts`:
- The trial balance period result equals the dashboard net profit for the same months.
- Closing balances of one range are the openings of the next.
- A branch trial balance balances on its own, because every journal belongs to one branch.
- General ledger pages chain: page 2's brought-forward equals page 1's last balance.

The other REPORTING.md KPIs (stock turnover, utilisation, first-time fix, AR ageing) are defined here when their modules exist.

## Labour time (WEB-023, WMS-007)

Code: `apps/api/src/workshop/labour.ts` (pure, unit-tested) and `labour.service.ts`. Source: `workshop.task_time_entry` and `workshop.job_task`.

- **Range:** local dates `from`–`to` in the company time zone, at most 366 days.
- **Scope:** the branches where the caller has `workshop.job.manage`; optional branch filter.
- **Freshness:** computed live from one REPEATABLE READ snapshot (`asOf`).
- **Counted entries:** closed and not voided. Open entries are listed as "clocked on now" and are not in the figures.
- **Seconds:** each entry's length is rounded half up to whole seconds; hours are shown with 2 decimals, half up.

| Figure | Definition |
|---|---|
| Clocked hours | Σ length of counted entries that **started** in the range |
| Entries / Jobs | Count of those entries / of distinct jobs among them |
| Tasks done | Tasks with status done, `done_at` in the range, by their assigned technician |
| Done without time | Tasks done that have no counted time from their technician (left out of efficiency) |
| Estimated | Σ estimated hours of the tasks done that have time |
| Actual on done tasks | Σ the technician's own counted time on those tasks, **any date** (time by others is not theirs) |
| Efficiency % | Estimated ÷ Actual × 100, 1 decimal, half up; **null without time**, shown as "No time" |

Totals add the technicians' figures; total efficiency is total estimated ÷ total actual. Labour cost is not computed (T-64).

## Quote arithmetic (T-71)

Code: `apps/api/src/quotes/quote-math.ts` (unit-tested). The database also checks the results.

| Figure | Definition |
|---|---|
| Line amount | Manager's price if set, else hours × labour rate; 2 decimals, half up |
| Subtotal | Σ line amounts |
| Discount | Subtotal × discount % ; 2 decimals, half up |
| Net | Subtotal − discount |
| Tax (prices exclude tax) | Net × rate ÷ 100 ; 2 decimals, half up ; total = net + tax |
| Tax (prices include tax) | Net × rate ÷ (100 + rate) ; 2 decimals, half up ; total = net |
| No default tax | Tax 0 ; total = net |

## Invoice and payment postings (T-72)

| Document | Debit | Credit |
|---|---|---|
| Invoice | Customer receivable: total | Labour revenue and parts revenue: total − tax, split in proportion to the labour and part line amounts (parts 2 decimals half up, labour the rest); tax payable (tax code's account): tax |
| Payment | Cash, card clearing or bank: amount | Customer receivable: amount |
| Credit note | The invoice journal's lines with debit and credit swapped (a reversal journal) | |

Invoice balance = total − Σ payments (0 for a cancelled invoice). Every posting uses the document date in the company time zone and needs an open fiscal period.

## Stock value (T-74)

| Figure | Definition |
|---|---|
| On hand | Σ movement quantities in − out, per part and branch (3 decimals) |
| Value | Σ movement values in − out (2 decimals); receipts and found stock at quantity × unit cost, half up; stock out at quantity × average, half up; the last units take the remaining value |
| Average cost | Value ÷ on hand (4 decimals); none when nothing is on hand |
| Reconciliation | Σ stock value (in the shown branches) = debit − credit of the inventory account in the ledger (same branches) |

## Cost of parts sold (T-75)

| Movement | Debit | Credit | Value |
|---|---|---|---|
| Issue to a job | Cost of parts sold | Inventory | Quantity × average cost, half up (the last units take the remaining value) |
| Return from a job | Inventory | Cost of parts sold | Exactly the value it was issued at |

Available to reserve = on hand − Σ reserved quantities at the branch.

## Supplier payables (T-76)

| Figure | Definition |
|---|---|
| Owed to a supplier | Σ (bill total − payments) over the supplier's bills that are not cancelled, in the caller's branches |
| Overdue | The part of "owed" on bills whose due date (invoice date + payment terms) is before today in the company's time zone |
| Bill total | Σ billed amounts (before tax) + tax; tax = billed amount × rate on the invoice date, 2 decimals half up |
| Price difference | Billed amount − the deliveries' stock value; posted to purchase price differences, stock value unchanged |
| Payables check | Open bills owed = payables account balance (credit − debit) in the same branches, read in one snapshot |
| Goods received check | Σ value of deliveries not on a live bill = goods received not invoiced balance (credit − debit) |

## Special orders (T-77)

| Figure | Definition |
|---|---|
| Days waiting | Whole days from ordering to arrival, or to now while waiting (24-hour periods, rounded down) |
| Arrival order | Waiting orders of a part at a branch take a delivery by order time; the first that does not fit in what is available (on hand − reserved) stops the round |
