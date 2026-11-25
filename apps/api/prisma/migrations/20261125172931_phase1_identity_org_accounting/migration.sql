-- CreateEnum
CREATE TYPE "platform"."RecordStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "accounting"."AccountType" AS ENUM ('asset', 'liability', 'equity', 'revenue', 'expense');

-- CreateEnum
CREATE TYPE "accounting"."PeriodStatus" AS ENUM ('open', 'closed');

-- CreateEnum
CREATE TYPE "accounting"."JournalSource" AS ENUM ('manual', 'reversal');

-- CreateTable
CREATE TABLE "org"."company" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "legal_name" TEXT NOT NULL,
    "legal_name_ar" TEXT,
    "base_currency" CHAR(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "status" "platform"."RecordStatus" NOT NULL DEFAULT 'active',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org"."branch" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_ar" TEXT,
    "status" "platform"."RecordStatus" NOT NULL DEFAULT 'active',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iam"."user" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "oidc_issuer" TEXT NOT NULL,
    "oidc_subject" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "is_platform_admin" BOOLEAN NOT NULL DEFAULT false,
    "status" "platform"."RecordStatus" NOT NULL DEFAULT 'active',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iam"."role" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_ar" TEXT,
    "permissions" TEXT[],
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iam"."role_assignment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "branch_id" UUID,
    "granted_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."audit_event" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "request_id" TEXT,
    "actor_user_id" UUID,
    "company_id" UUID,
    "branch_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "reason" TEXT,
    "before" JSONB,
    "after" JSONB,

    CONSTRAINT "audit_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."outbox_event" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID,
    "aggregate_type" TEXT NOT NULL,
    "aggregate_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "available_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(6),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,

    CONSTRAINT "outbox_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."document_sequence" (
    "company_id" UUID NOT NULL,
    "doc_type" TEXT NOT NULL,
    "series" TEXT NOT NULL,
    "next_value" BIGINT NOT NULL,

    CONSTRAINT "document_sequence_pkey" PRIMARY KEY ("company_id","doc_type","series")
);

-- CreateTable
CREATE TABLE "accounting"."account" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_ar" TEXT,
    "type" "accounting"."AccountType" NOT NULL,
    "parent_id" UUID,
    "is_posting" BOOLEAN NOT NULL,
    "status" "platform"."RecordStatus" NOT NULL DEFAULT 'active',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting"."fiscal_period" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "accounting"."PeriodStatus" NOT NULL DEFAULT 'open',
    "closed_at" TIMESTAMPTZ(6),
    "closed_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fiscal_period_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting"."journal" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "branch_id" UUID,
    "fiscal_period_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "posting_date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "total_debit" DECIMAL(20,6) NOT NULL,
    "total_credit" DECIMAL(20,6) NOT NULL,
    "source_type" "accounting"."JournalSource" NOT NULL,
    "source_id" TEXT,
    "reversal_of_id" UUID,
    "idempotency_key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "posted_by" UUID NOT NULL,
    "posted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting"."journal_line" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "journal_id" UUID NOT NULL,
    "line_no" INTEGER NOT NULL,
    "account_id" UUID NOT NULL,
    "branch_id" UUID,
    "description" TEXT,
    "debit" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "credit" DECIMAL(20,6) NOT NULL DEFAULT 0,

    CONSTRAINT "journal_line_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "branch_company_id_code_key" ON "org"."branch"("company_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "branch_company_id_id_key" ON "org"."branch"("company_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "user_oidc_issuer_oidc_subject_key" ON "iam"."user"("oidc_issuer", "oidc_subject");

-- CreateIndex
CREATE UNIQUE INDEX "role_company_id_code_key" ON "iam"."role"("company_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "role_company_id_id_key" ON "iam"."role"("company_id", "id");

-- CreateIndex
CREATE INDEX "role_assignment_user_id_company_id_idx" ON "iam"."role_assignment"("user_id", "company_id");

-- CreateIndex
CREATE INDEX "audit_event_company_id_occurred_at_id_idx" ON "platform"."audit_event"("company_id", "occurred_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "audit_event_entity_type_entity_id_idx" ON "platform"."audit_event"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "outbox_event_published_at_available_at_idx" ON "platform"."outbox_event"("published_at", "available_at");

-- CreateIndex
CREATE UNIQUE INDEX "account_company_id_code_key" ON "accounting"."account"("company_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "account_company_id_id_key" ON "accounting"."account"("company_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_period_company_id_id_key" ON "accounting"."fiscal_period"("company_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_period_company_id_name_key" ON "accounting"."fiscal_period"("company_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "journal_reversal_of_id_key" ON "accounting"."journal"("reversal_of_id");

-- CreateIndex
CREATE INDEX "journal_company_id_posted_at_id_idx" ON "accounting"."journal"("company_id", "posted_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "journal_company_id_posting_date_idx" ON "accounting"."journal"("company_id", "posting_date");

-- CreateIndex
CREATE UNIQUE INDEX "journal_company_id_id_key" ON "accounting"."journal"("company_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "journal_company_id_number_key" ON "accounting"."journal"("company_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "journal_company_id_idempotency_key_key" ON "accounting"."journal"("company_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "journal_company_id_source_type_source_id_key" ON "accounting"."journal"("company_id", "source_type", "source_id");

-- CreateIndex
CREATE INDEX "journal_line_company_id_account_id_idx" ON "accounting"."journal_line"("company_id", "account_id");

-- CreateIndex
CREATE UNIQUE INDEX "journal_line_journal_id_line_no_key" ON "accounting"."journal_line"("journal_id", "line_no");

-- AddForeignKey
ALTER TABLE "org"."branch" ADD CONSTRAINT "branch_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "org"."company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iam"."role" ADD CONSTRAINT "role_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "org"."company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iam"."role_assignment" ADD CONSTRAINT "role_assignment_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "org"."company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iam"."role_assignment" ADD CONSTRAINT "role_assignment_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "iam"."user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iam"."role_assignment" ADD CONSTRAINT "role_assignment_company_id_role_id_fkey" FOREIGN KEY ("company_id", "role_id") REFERENCES "iam"."role"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iam"."role_assignment" ADD CONSTRAINT "role_assignment_company_id_branch_id_fkey" FOREIGN KEY ("company_id", "branch_id") REFERENCES "org"."branch"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting"."account" ADD CONSTRAINT "account_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "org"."company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting"."account" ADD CONSTRAINT "account_company_id_parent_id_fkey" FOREIGN KEY ("company_id", "parent_id") REFERENCES "accounting"."account"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting"."fiscal_period" ADD CONSTRAINT "fiscal_period_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "org"."company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting"."journal" ADD CONSTRAINT "journal_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "org"."company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting"."journal" ADD CONSTRAINT "journal_company_id_branch_id_fkey" FOREIGN KEY ("company_id", "branch_id") REFERENCES "org"."branch"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting"."journal" ADD CONSTRAINT "journal_company_id_fiscal_period_id_fkey" FOREIGN KEY ("company_id", "fiscal_period_id") REFERENCES "accounting"."fiscal_period"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting"."journal" ADD CONSTRAINT "journal_company_id_reversal_of_id_fkey" FOREIGN KEY ("company_id", "reversal_of_id") REFERENCES "accounting"."journal"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting"."journal_line" ADD CONSTRAINT "journal_line_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "org"."company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting"."journal_line" ADD CONSTRAINT "journal_line_company_id_journal_id_fkey" FOREIGN KEY ("company_id", "journal_id") REFERENCES "accounting"."journal"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting"."journal_line" ADD CONSTRAINT "journal_line_company_id_account_id_fkey" FOREIGN KEY ("company_id", "account_id") REFERENCES "accounting"."account"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════
-- Hand-written, reviewed SQL (docs/ERD_PHASE1.md). Prisma does not model the
-- objects below; integration tests in apps/api/test exercise each of them
-- directly against PostgreSQL.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ── generic guards ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION platform.forbid_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ERP: % on %.% is not allowed; records are immutable (correct via reversal)',
    TG_OP, TG_TABLE_SCHEMA, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$;

-- ── org / iam ──────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX company_code_lower_key ON org.company (lower(code));
ALTER TABLE org.company
  ADD CONSTRAINT company_base_currency_iso CHECK (base_currency ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT company_code_format CHECK (code ~ '^[A-Za-z0-9_-]{2,32}$');
ALTER TABLE org.branch
  ADD CONSTRAINT branch_code_format CHECK (code ~ '^[A-Za-z0-9_-]{1,32}$');
ALTER TABLE iam.role
  ADD CONSTRAINT role_permissions_not_null CHECK (permissions IS NOT NULL);

-- One assignment per (user, role, branch); NULL branch (= all branches) counts as a value.
CREATE UNIQUE INDEX role_assignment_unique ON iam.role_assignment (user_id, role_id, branch_id) NULLS NOT DISTINCT;

-- ── platform ───────────────────────────────────────────────────────────────
CREATE TRIGGER audit_event_immutable
  BEFORE UPDATE OR DELETE ON platform.audit_event
  FOR EACH ROW EXECUTE FUNCTION platform.forbid_mutation();
CREATE TRIGGER audit_event_no_truncate
  BEFORE TRUNCATE ON platform.audit_event
  FOR EACH STATEMENT EXECUTE FUNCTION platform.forbid_mutation();

ALTER TABLE platform.document_sequence
  ADD CONSTRAINT document_sequence_positive CHECK (next_value >= 1);

-- ── accounting: accounts ───────────────────────────────────────────────────
ALTER TABLE accounting.account
  ADD CONSTRAINT account_code_format CHECK (code ~ '^[A-Za-z0-9.-]{1,32}$'),
  ADD CONSTRAINT account_not_own_parent CHECK (parent_id IS NULL OR parent_id <> id);

-- ── accounting: fiscal periods ─────────────────────────────────────────────
ALTER TABLE accounting.fiscal_period
  ADD CONSTRAINT fiscal_period_dates CHECK (end_date >= start_date),
  ADD CONSTRAINT fiscal_period_closed_fields CHECK ((status = 'closed') = (closed_at IS NOT NULL)),
  ADD CONSTRAINT fiscal_period_no_overlap
    EXCLUDE USING gist (company_id WITH =, daterange(start_date, end_date, '[]') WITH &&);

CREATE OR REPLACE FUNCTION accounting.guard_fiscal_period_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'closed' AND NEW.status = 'open' THEN
    RAISE EXCEPTION 'ERP: reopening a closed period requires the approval workflow'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF (NEW.start_date, NEW.end_date, NEW.company_id) IS DISTINCT FROM (OLD.start_date, OLD.end_date, OLD.company_id)
     AND EXISTS (SELECT 1 FROM accounting.journal j WHERE j.fiscal_period_id = OLD.id) THEN
    RAISE EXCEPTION 'ERP: period dates cannot change once journals are posted in it'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER fiscal_period_guard
  BEFORE UPDATE ON accounting.fiscal_period
  FOR EACH ROW EXECUTE FUNCTION accounting.guard_fiscal_period_update();

-- ── accounting: journals ───────────────────────────────────────────────────
ALTER TABLE accounting.journal
  ADD CONSTRAINT journal_totals_balanced CHECK (total_debit = total_credit AND total_debit > 0),
  ADD CONSTRAINT journal_currency_iso CHECK (currency ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT journal_reversal_consistent CHECK (
    (source_type = 'reversal') = (reversal_of_id IS NOT NULL)
    AND (reversal_of_id IS NULL OR source_id = reversal_of_id::text)),
  ADD CONSTRAINT journal_idempotency_key_format CHECK (length(idempotency_key) BETWEEN 8 AND 128);

ALTER TABLE accounting.journal_line
  ADD CONSTRAINT journal_line_one_side CHECK (
    debit >= 0 AND credit >= 0 AND ((debit > 0) <> (credit > 0))),
  ADD CONSTRAINT journal_line_no_positive CHECK (line_no >= 1);

-- A journal may only be inserted into the open period that contains its posting date.
-- FOR SHARE blocks a concurrent close (which takes FOR UPDATE) until this transaction ends.
CREATE OR REPLACE FUNCTION accounting.check_journal_period() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  p accounting.fiscal_period%ROWTYPE;
BEGIN
  SELECT * INTO p FROM accounting.fiscal_period
   WHERE company_id = NEW.company_id AND NEW.posting_date BETWEEN start_date AND end_date
   FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERP: no fiscal period contains posting date %', NEW.posting_date
      USING ERRCODE = 'check_violation';
  END IF;
  IF p.status <> 'open' THEN
    RAISE EXCEPTION 'ERP: fiscal period % is closed', p.name USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.fiscal_period_id IS DISTINCT FROM p.id THEN
    RAISE EXCEPTION 'ERP: fiscal_period_id does not match the posting date' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER journal_period_check
  BEFORE INSERT ON accounting.journal
  FOR EACH ROW EXECUTE FUNCTION accounting.check_journal_period();

-- Lines may only hit active posting accounts.
CREATE OR REPLACE FUNCTION accounting.check_journal_line_account() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM accounting.account a
     WHERE a.company_id = NEW.company_id AND a.id = NEW.account_id
       AND a.is_posting AND a.status = 'active'
     FOR SHARE) THEN
    RAISE EXCEPTION 'ERP: account % is not an active posting account', NEW.account_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER journal_line_account_check
  BEFORE INSERT ON accounting.journal_line
  FOR EACH ROW EXECUTE FUNCTION accounting.check_journal_line_account();

-- At commit: every journal has ≥ 2 lines and Σdebit = Σcredit = header totals.
CREATE OR REPLACE FUNCTION accounting.check_journal_balanced() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  jid uuid;
  h accounting.journal%ROWTYPE;
  d numeric; c numeric; n integer;
BEGIN
  -- NEW has a different row type per table, so read the journal id through jsonb.
  jid := CASE WHEN TG_TABLE_NAME = 'journal' THEN (to_jsonb(NEW) ->> 'id')::uuid
              ELSE (to_jsonb(NEW) ->> 'journal_id')::uuid END;
  SELECT * INTO h FROM accounting.journal WHERE id = jid;
  SELECT coalesce(sum(debit), 0), coalesce(sum(credit), 0), count(*) INTO d, c, n
    FROM accounting.journal_line WHERE journal_id = jid;
  IF n < 2 THEN
    RAISE EXCEPTION 'ERP: journal % must have at least two lines', h.number USING ERRCODE = 'check_violation';
  END IF;
  IF d <> c OR d <> h.total_debit OR c <> h.total_credit THEN
    RAISE EXCEPTION 'ERP: journal % is not balanced (debit %, credit %)', h.number, d, c
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER journal_balanced
  AFTER INSERT ON accounting.journal
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION accounting.check_journal_balanced();
CREATE CONSTRAINT TRIGGER journal_line_balanced
  AFTER INSERT ON accounting.journal_line
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION accounting.check_journal_balanced();

-- Posted journals and lines are append-only.
CREATE TRIGGER journal_immutable
  BEFORE UPDATE OR DELETE ON accounting.journal
  FOR EACH ROW EXECUTE FUNCTION platform.forbid_mutation();
CREATE TRIGGER journal_no_truncate
  BEFORE TRUNCATE ON accounting.journal
  FOR EACH STATEMENT EXECUTE FUNCTION platform.forbid_mutation();
CREATE TRIGGER journal_line_immutable
  BEFORE UPDATE OR DELETE ON accounting.journal_line
  FOR EACH ROW EXECUTE FUNCTION platform.forbid_mutation();
CREATE TRIGGER journal_line_no_truncate
  BEFORE TRUNCATE ON accounting.journal_line
  FOR EACH STATEMENT EXECUTE FUNCTION platform.forbid_mutation();
