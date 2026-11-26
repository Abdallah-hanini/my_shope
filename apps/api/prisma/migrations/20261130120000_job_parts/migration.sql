-- Parts on jobs and quotes, issue to jobs at cost, parts revenue on invoices (T-75). Tables generated
-- by prisma migrate diff, then reviewed; checks and triggers are hand-written.

-- AlterTable
ALTER TABLE "accounting"."posting_settings" ADD COLUMN     "cogs_account_id" UUID,
ADD COLUMN     "parts_revenue_account_id" UUID;

-- AlterTable
ALTER TABLE "inventory"."part" ADD COLUMN     "sale_price" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "inventory"."stock_movement" ADD COLUMN     "job_id" UUID;

-- AlterTable
ALTER TABLE "workshop"."invoice_line" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'labour',
ALTER COLUMN "hours" SET DATA TYPE DECIMAL(12,3);

-- AlterTable
ALTER TABLE "workshop"."quote_line" ADD COLUMN     "job_part_id" UUID,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'labour',
ALTER COLUMN "task_id" DROP NOT NULL,
ALTER COLUMN "hours" SET DATA TYPE DECIMAL(12,3);

-- CreateTable
CREATE TABLE "workshop"."job_part" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "part_id" UUID NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'reserved',
    "cost" DECIMAL(16,2),
    "issue_movement_id" UUID,
    "return_movement_id" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_part_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "job_part_issue_movement_id_key" ON "workshop"."job_part"("issue_movement_id");

-- CreateIndex
CREATE UNIQUE INDEX "job_part_return_movement_id_key" ON "workshop"."job_part"("return_movement_id");

-- CreateIndex
CREATE INDEX "job_part_job_id_idx" ON "workshop"."job_part"("job_id");

-- CreateIndex
CREATE INDEX "job_part_branch_id_part_id_status_idx" ON "workshop"."job_part"("branch_id", "part_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "quote_line_quote_id_job_part_id_key" ON "workshop"."quote_line"("quote_id", "job_part_id");

-- AddForeignKey
ALTER TABLE "workshop"."quote_line" ADD CONSTRAINT "quote_line_job_part_id_fkey" FOREIGN KEY ("job_part_id") REFERENCES "workshop"."job_part"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop"."job_part" ADD CONSTRAINT "job_part_company_id_job_id_fkey" FOREIGN KEY ("company_id", "job_id") REFERENCES "workshop"."job_card"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop"."job_part" ADD CONSTRAINT "job_part_company_id_part_id_fkey" FOREIGN KEY ("company_id", "part_id") REFERENCES "inventory"."part"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written rules -------------------------------------------------------

ALTER TABLE inventory.part
  ADD CONSTRAINT part_sale_price_positive CHECK (sale_price IS NULL OR sale_price > 0);

-- Quote and invoice lines are labour (a task) or a part (a job part).
ALTER TABLE workshop.quote_line
  ADD CONSTRAINT quote_line_kind CHECK (
    (kind = 'labour' AND task_id IS NOT NULL AND job_part_id IS NULL)
    OR (kind = 'part' AND job_part_id IS NOT NULL AND task_id IS NULL));
ALTER TABLE workshop.invoice_line
  ADD CONSTRAINT invoice_line_kind CHECK (kind IN ('labour', 'part'));

-- Stock movements now include issues to jobs and returns from them.
ALTER TABLE inventory.stock_movement DROP CONSTRAINT stock_movement_kind_valid;
ALTER TABLE inventory.stock_movement DROP CONSTRAINT stock_movement_adjustment_reason;
ALTER TABLE inventory.stock_movement
  ADD CONSTRAINT stock_movement_kind_valid CHECK (kind IN ('receipt', 'adjustment_in', 'adjustment_out', 'issue', 'return')),
  ADD CONSTRAINT stock_movement_adjustment_reason CHECK (kind NOT IN ('adjustment_in', 'adjustment_out') OR reason IS NOT NULL),
  ADD CONSTRAINT stock_movement_job CHECK ((kind IN ('issue', 'return')) = (job_id IS NOT NULL));

ALTER TABLE workshop.job_part
  ADD CONSTRAINT job_part_status_valid CHECK (status IN ('reserved', 'issued', 'returned', 'released')),
  ADD CONSTRAINT job_part_quantity_positive CHECK (quantity > 0),
  ADD CONSTRAINT job_part_issued_shape CHECK (
    (status IN ('issued', 'returned')) = (issue_movement_id IS NOT NULL AND cost IS NOT NULL)),
  ADD CONSTRAINT job_part_returned_shape CHECK ((status = 'returned') = (return_movement_id IS NOT NULL));

-- A job part's part, quantity and job never change; status only moves forward; never deleted.
CREATE OR REPLACE FUNCTION workshop.guard_job_part() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR NEW.part_id <> OLD.part_id OR NEW.quantity <> OLD.quantity OR NEW.job_id <> OLD.job_id
     OR NEW.branch_id <> OLD.branch_id
     OR NOT ((OLD.status = NEW.status)
             OR (OLD.status = 'reserved' AND NEW.status IN ('issued', 'released'))
             OR (OLD.status = 'issued' AND NEW.status = 'returned')) THEN
    RAISE EXCEPTION 'job_part_immutable' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER job_part_guard BEFORE UPDATE OR DELETE ON workshop.job_part
  FOR EACH ROW EXECUTE FUNCTION workshop.guard_job_part();

-- Reservations never exceed what is on hand at the branch (the stock row is locked).
CREATE OR REPLACE FUNCTION workshop.guard_job_part_reservation() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  on_hand numeric;
  reserved numeric;
BEGIN
  IF NEW.status <> 'reserved' THEN RETURN NEW; END IF;
  SELECT s.on_hand INTO on_hand FROM inventory.stock s
   WHERE s.branch_id = NEW.branch_id AND s.part_id = NEW.part_id FOR UPDATE;
  SELECT COALESCE(sum(quantity), 0) INTO reserved FROM workshop.job_part
   WHERE branch_id = NEW.branch_id AND part_id = NEW.part_id AND status = 'reserved' AND id <> NEW.id;
  IF COALESCE(on_hand, 0) - reserved < NEW.quantity THEN
    RAISE EXCEPTION 'job_part_not_available' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER job_part_reservation BEFORE INSERT ON workshop.job_part
  FOR EACH ROW EXECUTE FUNCTION workshop.guard_job_part_reservation();

-- Timeline: parts on the job.
ALTER TABLE workshop.job_event DROP CONSTRAINT job_event_kind_valid;
ALTER TABLE workshop.job_event ADD CONSTRAINT job_event_kind_valid CHECK (kind IN (
  'created', 'status', 'assignment', 'task_done', 'task_reopened', 'qc_pass', 'qc_fail', 'note', 'updated',
  'inspection', 'photo_added', 'photo_removed',
  'addition_proposed', 'addition_approved', 'addition_declined', 'addition_withdrawn', 'bay',
  'quote_issued', 'quote_approved', 'quote_declined',
  'invoice_posted', 'credit_note_posted', 'payment_received', 'unpaid_release',
  'part_reserved', 'part_released', 'part_issued', 'part_returned'));
