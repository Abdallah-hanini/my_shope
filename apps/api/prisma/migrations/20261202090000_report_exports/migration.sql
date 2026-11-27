-- RPT R2b2: the statements and analytics reports can be exported too. Widens the closed vocabulary
-- only (every existing row stays valid); the per-kind permission and parameters are enforced by the
-- API, as for the original kinds.
ALTER TABLE "platform"."export_job"
  DROP CONSTRAINT export_job_kind_valid,
  ADD CONSTRAINT export_job_kind_valid CHECK (kind IN (
    'trial_balance', 'general_ledger', 'journal_lines',
    'profit_and_loss', 'balance_sheet', 'receivables_aging', 'payables_aging',
    'cash_flow', 'tax_summary', 'sales', 'stock_movement'
  ));
