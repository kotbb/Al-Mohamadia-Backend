import { SupplierResponseDto } from '../../../suppliers/dto/response/supplier-response.dto';
import { ItemResponseDto } from '../../../items/dto/response/item-response.dto';
import { PricingMode } from '../../../../shared/enums/pricing-mode.enum';
import { PurchaseInvoiceStatus } from '../../../../shared/enums/purchase-invoice-status.enum';

export class PurchaseInvoiceLineResponseDto {
  itemId: string;
  quantity: number;
  pricingModeSnapshot: PricingMode;
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
  accountPaymentAmount: number;
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

export class PurchaseInvoiceListItemResponseDto extends PurchaseInvoiceResponseDto {
  supplierName: string | null;
}

export class PurchaseInvoiceListResponseDto {
  items: PurchaseInvoiceListItemResponseDto[];
  meta: PurchaseInvoiceListMetaDto;
  summary: PurchaseInvoiceListSummaryDto;
}

export class PurchaseInvoiceDetailResponseDto extends PurchaseInvoiceResponseDto {
  supplier: SupplierResponseDto | null;
  items: ItemResponseDto[];
}
