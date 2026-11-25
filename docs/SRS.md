# Functional specification
All requirements mandatory in full scope unless marked conditional. Expand each ID into user stories, API contracts and positive/negative acceptance cases before implementation.

## WMS
WMS-001: The system shall support Customer and vehicle registry.
WMS-002: The system shall support service scheduling and capacity.
WMS-003: The system shall support check-in inspection/photos.
WMS-004: The system shall support diagnostics and fault codes.
WMS-005: The system shall support versioned estimates and customer approval.
WMS-006: The system shall support job cards and assignments.
WMS-007: The system shall support labor time and costs.
WMS-008: The system shall support reserve/issue/return parts.
WMS-009: The system shall support additional approvals.
WMS-010: The system shall support repair status and ETA.
WMS-011: The system shall support QC/rework.
WMS-012: The system shall support invoice/delivery.
WMS-013: The system shall support service history/warranty.
WMS-014: The system shall support outsourced services and fleet jobs.

## INV
INV-001: The system shall support OEM/alternate/superseded numbers and barcodes.
INV-002: The system shall support fitment by make/model/year/engine.
INV-003: The system shall support genuine/aftermarket/used/refurbished.
INV-004: The system shall support retail/wholesale pricing.
INV-005: The system shall support warehouse/bin.
INV-006: The system shall support stock movements and reservations.
INV-007: The system shall support receipts/issues/transfers.
INV-008: The system shall support quarantine and condition inspection.
INV-009: The system shall support counts/adjustments with approval.
INV-010: The system shall support FIFO or weighted average policy.
INV-011: The system shall support landed cost.
INV-012: The system shall support low stock and aging.
INV-013: The system shall support serial tracking.
INV-014: The system shall support kits and special orders.

## PRC
PRC-001: The system shall support Supplier profiles and terms.
PRC-002: The system shall support requisitions.
PRC-003: The system shall support RFQ comparison.
PRC-004: The system shall support PO approvals.
PRC-005: The system shall support partial goods receipts.
PRC-006: The system shall support quality inspection.
PRC-007: The system shall support three-way matching.
PRC-008: The system shall support purchase returns.
PRC-009: The system shall support foreign currency and landed costs.
PRC-010: The system shall support supplier performance.

## POS
POS-001: The system shall support Quotes and orders.
POS-002: The system shall support barcode checkout.
POS-003: The system shall support cash/card/transfer/credit.
POS-004: The system shall support partial and split payments.
POS-005: The system shall support deposits.
POS-006: The system shall support credit limits.
POS-007: The system shall support discount/margin approvals.
POS-008: The system shall support returns/refunds.
POS-009: The system shall support cashier shifts and reconciliation.
POS-010: The system shall support receipts.
POS-011: The system shall support delivery.
POS-012: The system shall support commissions.

## ACC
ACC-001: The system shall support Chart of accounts.
ACC-002: The system shall support journals and GL.
ACC-003: The system shall support AR/AP.
ACC-004: The system shall support cash and bank.
ACC-005: The system shall support reconciliation.
ACC-006: The system shall support expenses/petty cash.
ACC-007: The system shall support fixed assets/depreciation.
ACC-008: The system shall support periods.
ACC-009: The system shall support cost centers.
ACC-010: The system shall support currency/tax.
ACC-011: The system shall support budgets.
ACC-012: The system shall support credit/debit notes.
ACC-013: The system shall support WIP.
ACC-014: The system shall support opening balances.
ACC-015: The system shall support accruals and prepayments.
ACC-016: The system shall support financial statements.
ACC-017: The system shall support intercompany policy.

## HR
HR-001: The system shall support Employee contracts and documents.
HR-002: The system shall support attendance and shifts.
HR-003: The system shall support leave.
HR-004: The system shall support overtime.
HR-005: The system shall support payroll allowances/deductions.
HR-006: The system shall support loans/advances.
HR-007: The system shall support commissions.
HR-008: The system shall support evaluations and technician productivity.
HR-009: The system shall support expiry alerts.
HR-010: The system shall support onboarding/offboarding.
HR-011: The system shall support end-of-service.
HR-012: The system shall support self-service.
HR-013: The system shall support payroll approvals.

## CRM
CRM-001: The system shall support Individual/corporate contacts.
CRM-002: The system shall support customer 360 and multiple vehicles.
CRM-003: The system shall support communications.
CRM-004: The system shall support leads/opportunities.
CRM-005: The system shall support followups.
CRM-006: The system shall support maintenance reminders.
CRM-007: The system shall support complaints and feedback.
CRM-008: The system shall support segmentation.
CRM-009: The system shall support loyalty/campaigns.
CRM-010: The system shall support consent.
CRM-011: The system shall support fleet contracts.
CRM-012: The system shall support outstanding reminders.

## QAS
QAS-001: The system shall support Inspection templates.
QAS-002: The system shall support mandatory QC and rework.
QAS-003: The system shall support warranty claims linked to original documents.
QAS-004: The system shall support root cause.
QAS-005: The system shall support supplier quality.
QAS-006: The system shall support equipment/tools.
QAS-007: The system shall support preventive maintenance/calibration.
QAS-008: The system shall support asset assignment.

## ADM
ADM-001: The system shall support Company/branch configuration.
ADM-002: The system shall support RBAC and scopes.
ADM-003: The system shall support approval matrix.
ADM-004: The system shall support feature flags.
ADM-005: The system shall support templates.
ADM-006: The system shall support bilingual RTL.
ADM-007: The system shall support audit.
ADM-008: The system shall support notification settings.
ADM-009: The system shall support import/export.
ADM-010: The system shall support global search.
ADM-011: The system shall support role-specific dashboard.

## State and acceptance rules
Job: draft -> approved -> assigned -> in progress -> QC -> ready -> delivered; failed QC -> rework; cancellation requires disposition of parts/deposits. Quote approval snapshots amount and revision. PO: draft -> approved -> sent -> partial/received -> closed; cancellation cannot erase receipts. Invoice: draft -> posted -> partially paid/paid; credit notes reverse posted amounts. Transfers: requested -> approved -> dispatched -> received, with in-transit accountability. Approval: pending -> approved/rejected/expired; version check and actor scope mandatory. All transitions server-enforced, audited and atomic where financial. Each module requires list/detail/search, validated inputs, permissions, error/loading/empty states, history and relevant reports. Refer to MOBILE and REPORTING for additional mandatory requirements.
