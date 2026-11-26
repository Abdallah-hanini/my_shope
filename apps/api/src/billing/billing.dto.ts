import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AccountRefDto } from '../settings/settings.dto';

export class InvoiceLineDto {
  @ApiProperty() lineNo!: number;
  @ApiProperty() description!: string;
  @ApiProperty() hours!: string;
  @ApiProperty() rate!: string;
  @ApiProperty() amount!: string;
}

export class PaymentDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'RC-2026-000001' }) number!: string;
  @ApiProperty({ enum: ['cash', 'card', 'bank'] }) method!: string;
  @ApiProperty() amount!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) reference!: string | null;
  @ApiProperty() receivedByName!: string;
  @ApiProperty({ format: 'date-time' }) receivedAt!: string;
  @ApiProperty() journalNumber!: string;
}

export class InvoiceDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['invoice', 'credit_note'] }) kind!: string;
  @ApiProperty({ example: 'INV-2026-000001' }) number!: string;
  @ApiProperty({ example: '2026-11-29' }) invoiceDate!: string;
  @ApiProperty() currency!: string;
  @ApiProperty() customerName!: string;
  @ApiProperty() quoteId!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) quoteNumber!: string | null;
  @ApiProperty() subtotal!: string;
  @ApiProperty() discountAmount!: string;
  @ApiProperty() netAmount!: string;
  @ApiProperty() taxAmount!: string;
  @ApiProperty() total!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) taxCode!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) taxPct!: string | null;
  @ApiProperty() pricesIncludeTax!: boolean;
  @ApiProperty({ description: 'Invoice cancelled by a credit note' }) credited!: boolean;
  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Credit note: the invoice number it cancels',
  })
  creditOfNumber!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) reason!: string | null;
  @ApiProperty({ description: 'Total minus payments (0 for credit notes)' }) balance!: string;
  @ApiProperty() journalId!: string;
  @ApiProperty() journalNumber!: string;
  @ApiProperty() createdByName!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: [InvoiceLineDto] }) lines!: InvoiceLineDto[];
  @ApiProperty({ type: [PaymentDto] }) payments!: PaymentDto[];
  @ApiProperty({ type: [String], description: 'pay, credit' }) actions!: string[];
}

export class UnpaidReleaseDto {
  @ApiProperty() byName!: string;
  @ApiProperty({ format: 'date-time' }) at!: string;
  @ApiProperty() reason!: string;
}

export class JobBillingDto {
  @ApiProperty() jobId!: string;
  @ApiProperty() currency!: string;
  @ApiProperty({ type: [InvoiceDto], description: 'Invoices and credit notes, newest first' })
  documents!: InvoiceDto[];
  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'The latest quote the customer approved',
  })
  approvedQuoteId!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) approvedQuoteNumber!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) approvedQuoteTotal!: string | null;
  @ApiProperty({ description: 'The caller can invoice the approved quote now' }) canInvoice!: boolean;
  @ApiProperty({
    type: [String],
    description: 'Posting settings still missing (labourRevenue, receivable, cash, card, bank)',
  })
  missingAccounts!: string[];
  @ApiProperty({ description: 'Paid in full, or released by the owner: the car may leave' })
  clearedForDelivery!: boolean;
  @ApiPropertyOptional({ nullable: true, type: UnpaidReleaseDto }) unpaidRelease!: UnpaidReleaseDto | null;
  @ApiProperty({ description: 'The caller (owner) can let the car leave unpaid' }) canReleaseUnpaid!: boolean;
}

export class PostingSettingsDto {
  @ApiPropertyOptional({ nullable: true, type: AccountRefDto }) labourRevenueAccount!: AccountRefDto | null;
  @ApiPropertyOptional({ nullable: true, type: AccountRefDto }) receivableAccount!: AccountRefDto | null;
  @ApiPropertyOptional({ nullable: true, type: AccountRefDto }) cashAccount!: AccountRefDto | null;
  @ApiPropertyOptional({ nullable: true, type: AccountRefDto }) cardAccount!: AccountRefDto | null;
  @ApiPropertyOptional({ nullable: true, type: AccountRefDto }) bankAccount!: AccountRefDto | null;
  @ApiProperty({ description: '0 until first saved' }) version!: number;
  @ApiProperty() canManage!: boolean;
}

// Request bodies.
export class SetPostingSettingsDto {
  @ApiProperty() version!: number;
  @ApiPropertyOptional({ nullable: true, type: String }) labourRevenueAccountId!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) receivableAccountId!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) cashAccountId!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) cardAccountId!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) bankAccountId!: string | null;
}
export class CreateInvoiceDto {
  @ApiProperty({ description: 'The approved quote to invoice' }) quoteId!: string;
}
export class RecordPaymentDto {
  @ApiProperty({ enum: ['cash', 'card', 'bank'] }) method!: string;
  @ApiProperty({ example: '100.00' }) amount!: string;
  @ApiPropertyOptional({ nullable: true, type: String, description: 'Required for card and bank' })
  reference?: string | null;
  @ApiProperty({ description: 'A new UUID per payment form; repeats return the same payment' })
  idempotencyKey!: string;
}
export class CreditNoteDto {
  @ApiProperty() reason!: string;
}
export class ReleaseUnpaidDto {
  @ApiProperty() version!: number;
  @ApiProperty() reason!: string;
}
