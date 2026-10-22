import { PaymentMethod } from '../../../../shared/enums/payment-method.enum';

export class PaymentResponseDto {
  id: string;
  customerId: string | null;
  customerName?: string | null;
  invoiceId: string | null;
  sourceInvoiceId?: string | null;
  invoiceNumber?: string | null;
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

export class PaymentListMetaDto {
  page: number;
  limit: number;
  total: number;
}

export class PaymentListSummaryDto {
  totalAmount: number;
}

export class PaymentListResponseDto {
  items: PaymentResponseDto[];
  meta: PaymentListMetaDto;
  summary: PaymentListSummaryDto;
}
