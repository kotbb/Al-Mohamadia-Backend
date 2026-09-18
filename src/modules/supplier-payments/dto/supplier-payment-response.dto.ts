import { PaymentMethod } from '../../../shared/enums/payment-method.enum';

export class SupplierPaymentResponseDto {
  id: string;
  supplierId: string;
  supplierName?: string | null;
  purchaseInvoiceId: string | null;
  purchaseInvoiceNumber?: string | null;
  amount: number;
  method: PaymentMethod;
  notes: string | null;
  recordedBy: string;
  reversedAt: Date | null;
  reversedBy: string | null;
  isReversed: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export class SupplierPaymentListMetaDto {
  page: number;
  limit: number;
  total: number;
}

export class SupplierPaymentListSummaryDto {
  totalAmount: number;
}

export class SupplierPaymentListResponseDto {
  items: SupplierPaymentResponseDto[];
  meta: SupplierPaymentListMetaDto;
  summary: SupplierPaymentListSummaryDto;
}
