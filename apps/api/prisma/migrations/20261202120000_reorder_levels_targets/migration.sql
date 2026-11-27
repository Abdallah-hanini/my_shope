-- CreateTable
CREATE TABLE "inventory"."reorder_level" (
    "company_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "part_id" UUID NOT NULL,
    "min_quantity" DECIMAL(14,3) NOT NULL,
    "reorder_quantity" DECIMAL(14,3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reorder_level_pkey" PRIMARY KEY ("branch_id","part_id")
);

-- CreateTable
CREATE TABLE "reporting"."sales_target" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "branch_id" UUID,
    "month" DATE NOT NULL,
    "amount" DECIMAL(16,2) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_target_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reorder_level_company_id_part_id_idx" ON "inventory"."reorder_level"("company_id", "part_id");

-- CreateIndex
CREATE INDEX "sales_target_company_id_month_idx" ON "reporting"."sales_target"("company_id", "month");

-- AddForeignKey
ALTER TABLE "inventory"."reorder_level" ADD CONSTRAINT "reorder_level_company_id_part_id_fkey" FOREIGN KEY ("company_id", "part_id") REFERENCES "inventory"."part"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."reorder_level" ADD CONSTRAINT "reorder_level_company_id_branch_id_fkey" FOREIGN KEY ("company_id", "branch_id") REFERENCES "org"."branch"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reporting"."sales_target" ADD CONSTRAINT "sales_target_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "org"."company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reporting"."sales_target" ADD CONSTRAINT "sales_target_company_id_branch_id_fkey" FOREIGN KEY ("company_id", "branch_id") REFERENCES "org"."branch"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- R3a rules. Reorder points are whole quantities a buyer can act on; targets are positive money.
ALTER TABLE "inventory"."reorder_level"
  ADD CONSTRAINT reorder_level_min_nonnegative CHECK (min_quantity >= 0),
  ADD CONSTRAINT reorder_level_reorder_positive CHECK (reorder_quantity > 0);

ALTER TABLE "reporting"."sales_target"
  ADD CONSTRAINT sales_target_amount_positive CHECK (amount > 0),
  ADD CONSTRAINT sales_target_first_of_month CHECK (extract(day FROM month) = 1);

-- One target per company, branch (empty = whole company) and month.
CREATE UNIQUE INDEX sales_target_unique ON reporting.sales_target (company_id, branch_id, month) NULLS NOT DISTINCT;

-- The owner sets targets: a new permission, given to the company administrator role.
UPDATE iam.role
   SET permissions = (
         SELECT array_agg(DISTINCT p ORDER BY p)
           FROM unnest(permissions || ARRAY['reports.targets.manage']) AS p),
       version = version + 1,
       updated_at = now()
 WHERE is_system AND code = 'company-admin';
