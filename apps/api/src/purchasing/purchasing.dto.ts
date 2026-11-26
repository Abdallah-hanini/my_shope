import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Suppliers, supplier bills and supplier payments (T-76). Money is a string with 2 decimals.

export class SupplierDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) nameAr!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) phone!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) email!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) taxNumber!: string | null;
  @ApiProperty({ description: 'Days from invoice date to due date' }) paymentTermsDays!: number;
  @ApiProperty() active!: boolean;
  @ApiProperty() version!: number;
  @ApiProperty({ example: '150.00', description: 'Still owed on open bills (caller’s branches)' })
  balance!: string;
  @ApiProperty({ example: '0.00', description: 'Of which past the due date' }) overdue!: string;
}

export class SupplierListDto {
  @ApiProperty({ type: [SupplierDto] }) suppliers!: SupplierDto[];
  @ApiProperty({ description: 'The caller may add and edit suppliers' }) canManage!: boolean;
}

export class SupplierBillLineDto {
  @ApiProperty() lineNo!: number;
  @ApiProperty() movementId!: string;
  @ApiProperty({ example: 'SM-2026-000001' }) movementNumber!: string;
  @ApiProperty() sku!: string;
  @ApiProperty() partName!: string;
  @ApiProperty() quantity!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) reference!: string | null;
  @ApiProperty({ description: 'Stock value of the receipt' }) receiptValue!: string;
  @ApiProperty({ description: 'What the supplier billed for it, before tax' }) amount!: string;
}

export class SupplierPaymentDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'PV-2026-000001' }) number!: string;
  @ApiProperty({ enum: ['cash', 'bank'] }) method!: string;
  @ApiProperty() amount!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) reference!: string | null;
  @ApiProperty() paidByName!: string;
  @ApiProperty({ format: 'date-time' }) paidAt!: string;
  @ApiProperty() journalNumber!: string;
}

export class SupplierBillSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'PB-2026-000001' }) number!: string;
  @ApiProperty() supplierId!: string;
  @ApiProperty() supplierName!: string;
  @ApiProperty() branchCode!: string;
  @ApiProperty() supplierInvoiceNo!: string;
  @ApiProperty({ format: 'date' }) billDate!: string;
  @ApiProperty({ format: 'date' }) dueDate!: string;
  @ApiProperty() currency!: string;
  @ApiProperty() total!: string;
  @ApiProperty() paid!: string;
  @ApiProperty() balance!: string;
  @ApiProperty({ enum: ['open', 'paid', 'cancelled'] }) status!: string;
  @ApiProperty({ description: 'Open and past its due date' }) overdue!: boolean;
}

export class SupplierBillDto extends SupplierBillSummaryDto {
  @ApiProperty() receiptsValue!: string;
  @ApiProperty() netAmount!: string;
  @ApiProperty({ description: 'Billed minus the receipts’ value (price variance)' }) varianceAmount!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) varianceReason!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) taxCode!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) taxPct!: string | null;
  @ApiProperty() taxAmount!: string;
  @ApiProperty() journalNumber!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) cancelJournalNumber!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) cancelReason!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) cancelledByName!: string | null;
  @ApiProperty() createdByName!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: [SupplierBillLineDto] }) lines!: SupplierBillLineDto[];
  @ApiProperty({ type: [SupplierPaymentDto] }) payments!: SupplierPaymentDto[];
  @ApiProperty({ type: [String], enum: ['pay', 'cancel'], description: 'What the caller may do now' })
  actions!: string[];
  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Why the caller may not pay (they entered this bill)',
  })
  payBlockedReason!: string | null;
}

export class BranchRefDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
}

export class SupplierDetailDto extends SupplierDto {
  @ApiProperty({ type: [SupplierBillSummaryDto], description: 'Newest first (up to 200)' })
  bills!: SupplierBillSummaryDto[];
  @ApiProperty() canManage!: boolean;
  @ApiProperty({ type: [BranchRefDto], description: 'Branches where the caller may enter bills' })
  billBranches!: BranchRefDto[];
}

export class ReconciliationDto {
  @ApiProperty({ description: 'Open bills still owed' }) openBills!: string;
  @ApiPropertyOptional({ nullable: true, type: String, description: 'Payables account balance (credit)' })
  payablesLedger!: string | null;
  @ApiProperty({ description: 'Receipts not yet on a bill' }) unbilledReceipts!: string;
  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Goods received not invoiced balance (credit)',
  })
  goodsReceivedLedger!: string | null;
  @ApiProperty({ description: 'Both pairs agree (accounts set)' }) reconciled!: boolean;
  @ApiProperty({ format: 'date-time' }) asOf!: string;
}

export class SupplierBillListDto {
  @ApiProperty({ type: [SupplierBillSummaryDto] }) bills!: SupplierBillSummaryDto[];
  @ApiProperty({ type: ReconciliationDto }) reconciliation!: ReconciliationDto;
  @ApiProperty() currency!: string;
}

export class UnbilledReceiptDto {
  @ApiProperty() movementId!: string;
  @ApiProperty() number!: string;
  @ApiProperty() sku!: string;
  @ApiProperty() partName!: string;
  @ApiProperty() quantity!: string;
  @ApiProperty() unitCost!: string;
  @ApiProperty() value!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) reference!: string | null;
  @ApiProperty({ description: 'False for older receipts recorded without a supplier' })
  fromThisSupplier!: boolean;
  @ApiProperty({ format: 'date-time' }) receivedAt!: string;
}

export class TaxChoiceDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
}

export class UnbilledReceiptsDto {
  @ApiProperty() branchId!: string;
  @ApiProperty({ type: [UnbilledReceiptDto] }) receipts!: UnbilledReceiptDto[];
  @ApiProperty({ type: [TaxChoiceDto], description: 'Active tax codes for the bill' })
  taxCodes!: TaxChoiceDto[];
  @ApiPropertyOptional({ nullable: true, type: String }) defaultTaxCodeId!: string | null;
}

// Request bodies.
export class CreateSupplierDto {
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) nameAr?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) phone?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) email?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) taxNumber?: string | null;
  @ApiProperty() paymentTermsDays!: number;
}
export class UpdateSupplierDto extends CreateSupplierDto {
  @ApiProperty() version!: number;
  @ApiProperty() active!: boolean;
}
export class SupplierBillLineInputDto {
  @ApiProperty() movementId!: string;
  @ApiProperty({ example: '91.00' }) amount!: string;
}
export class CreateSupplierBillDto {
  @ApiProperty() supplierId!: string;
  @ApiProperty() branchId!: string;
  @ApiProperty() supplierInvoiceNo!: string;
  @ApiProperty({ format: 'date' }) billDate!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) taxCodeId!: string | null;
  @ApiProperty({ type: [SupplierBillLineInputDto] }) lines!: SupplierBillLineInputDto[];
  @ApiPropertyOptional({ nullable: true, type: String }) varianceReason?: string | null;
  @ApiProperty() idempotencyKey!: string;
}
export class SupplierPaymentInputDto {
  @ApiProperty({ enum: ['cash', 'bank'] }) method!: string;
  @ApiProperty() amount!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) reference?: string | null;
  @ApiProperty() idempotencyKey!: string;
}
export class CancelSupplierBillDto {
  @ApiProperty() reason!: string;
}
