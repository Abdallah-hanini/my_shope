-- Data migration (reviewed): existing company-administrator roles receive the new staff-management
-- permission, as new companies do (COMPANY_ADMIN_ROLE in @erp/validation). No schema change.
UPDATE iam.role
   SET permissions = array_append(permissions, 'iam.user.manage'),
       version = version + 1,
       updated_at = now()
 WHERE is_system AND code = 'company-admin' AND NOT ('iam.user.manage' = ANY (permissions));
