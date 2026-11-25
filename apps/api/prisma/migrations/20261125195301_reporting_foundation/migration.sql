-- CreateEnum
CREATE TYPE "accounting"."AccountReportingClass" AS ENUM ('cash', 'bank', 'receivable', 'payable', 'inventory', 'cogs');

-- AlterTable
ALTER TABLE "accounting"."account" ADD COLUMN     "reporting_class" "accounting"."AccountReportingClass";

-- ═══════════════════════════════════════════════════════════════════════════
-- Hand-written, reviewed SQL. See docs/KPI_DICTIONARY.md.
-- ═══════════════════════════════════════════════════════════════════════════

-- A reporting class must match the account type and is allowed on posting accounts only.
ALTER TABLE accounting.account
  ADD CONSTRAINT account_reporting_class_valid CHECK (
    reporting_class IS NULL
    OR (is_posting AND (
         (reporting_class IN ('cash', 'bank', 'receivable', 'inventory') AND type = 'asset')
      OR (reporting_class = 'payable' AND type = 'liability')
      OR (reporting_class = 'cogs' AND type = 'expense'))));

-- Canonical ledger fact view for reports: one row per posted journal line. Read-only; reports
-- aggregate from here so every figure reconciles to accounting.journal_line.
CREATE VIEW reporting.ledger_line AS
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
       jl.credit
  FROM accounting.journal_line jl
  JOIN accounting.journal j ON j.id = jl.journal_id AND j.company_id = jl.company_id
  JOIN accounting.account a ON a.id = jl.account_id AND a.company_id = jl.company_id;

COMMENT ON VIEW reporting.ledger_line IS 'Posted journal lines with account classification; source of all financial KPIs';

-- Data migration: existing company-administrator roles receive the new reporting permission,
-- as new companies do (COMPANY_ADMIN_ROLE in @erp/validation).
UPDATE iam.role
   SET permissions = array_append(permissions, 'reports.financial.read'),
       version = version + 1,
       updated_at = now()
 WHERE is_system AND code = 'company-admin' AND NOT ('reports.financial.read' = ANY (permissions));
