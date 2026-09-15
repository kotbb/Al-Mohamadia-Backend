import { SalesInvoiceStatus } from '../../../shared/enums/sales-invoice-status.enum';
import { SalesInvoiceType } from '../../../shared/enums/sales-invoice-type.enum';

export class SalesInvoiceLineResponseDto {
  itemId: string;
  quantity: number;
  width: number | null;
  length: number | null;
  thickness: number | null;
  piecePrice: number;
  costPriceSnapshot: number;
  lineTotal: number;
  note: string | null;
}

export class SalesInvoiceResponseDto {
  id: string;
  invoiceNumber: string;
  type: SalesInvoiceType;
  customerId: string | null;
  lines: SalesInvoiceLineResponseDto[];
  total: number;
  discount: number;
  paid: number;
  remaining: number;
  status: SalesInvoiceStatus;
  createdBy: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export class SalesInvoiceListResponseDto {
  items: SalesInvoiceResponseDto[];
  meta: {
    page: number;
    limit: number;
    total: number;
  };
}
