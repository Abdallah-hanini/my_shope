-- WEB-100 general ledger and WEB-122 trial balance read the same view as the KPIs.
-- Columns are only appended (CREATE OR REPLACE VIEW keeps the existing ones unchanged).
CREATE OR REPLACE VIEW reporting.ledger_line AS
SELECT jl.company_id,
       j.branch_id,
       j.id            AS journal_id,
       j.number        AS journal_number,
       j.posting_date,
       j.source_type,
       j.reversal_of_id,
       jl.account_id,
       a.code          AS account_code,
       a.type          AS account_type,
       a.reporting_class,
       jl.debit,
       jl.credit,
       jl.id           AS line_id,
       jl.line_no,
       coalesce(jl.description, j.description) AS description
  FROM accounting.journal_line jl
  JOIN accounting.journal j ON j.id = jl.journal_id AND j.company_id = jl.company_id
  JOIN accounting.account a ON a.id = jl.account_id AND a.company_id = jl.company_id;

COMMENT ON VIEW reporting.ledger_line IS 'Posted journal lines with account classification; source of all financial KPIs, the trial balance and the general ledger';
