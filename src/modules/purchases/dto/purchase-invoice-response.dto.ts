import { PurchaseInvoiceStatus } from '../../../shared/enums/purchase-invoice-status.enum';

export class PurchaseInvoiceLineResponseDto {
  itemId: string;
  quantity: number;
  width: number | null;
  length: number | null;
  thickness: number | null;
  unitCost: number;
  lineTotal: number;
  note: string | null;
}

export class PurchaseInvoiceResponseDto {
  id: string;
  invoiceNumber: string;
  supplierId: string;
  lines: PurchaseInvoiceLineResponseDto[];
  total: number;
  paid: number;
  remaining: number;
  status: PurchaseInvoiceStatus;
  notes: string | null;
  createdBy: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export class PurchaseInvoiceListMetaDto {
  page: number;
  limit: number;
  total: number;
}

export class PurchaseInvoiceListSummaryDto {
  totalAmount: number;
}

export class PurchaseInvoiceListResponseDto {
  items: PurchaseInvoiceResponseDto[];
  meta: PurchaseInvoiceListMetaDto;
  summary: PurchaseInvoiceListSummaryDto;
}
