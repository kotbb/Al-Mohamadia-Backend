import { PricingMode } from '../../../../shared/enums/pricing-mode.enum';

export class PublicInvoiceLineDto {
  pricingModeSnapshot: PricingMode;
  itemLabel: string;
  quantity: number;
  width: number | null;
  length: number | null;
  thickness: number | null;
  piecePrice: number;
  lineTotal: number;
  note: string | null;
}

export class PublicInvoiceResponseDto {
  invoiceNumber: string;
  createdAt: string;
  status: string;
  type: string;
  customerName: string | null;
  lines: PublicInvoiceLineDto[];
  total: number;
  discount: number;
  paid: number;
  accountPaymentAmount: number;
  remaining: number;
}
