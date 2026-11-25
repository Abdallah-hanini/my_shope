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

The other REPORTING.md KPIs (stock turnover, utilisation, first-time fix, AR ageing) are defined here when their modules exist.
