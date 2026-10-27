import { CustomerResponseDto } from '../../../customers/dto/response/customer-response.dto';
import { ItemResponseDto } from '../../../items/dto/response/item-response.dto';
import { PricingMode } from '../../../../shared/enums/pricing-mode.enum';
import { SalesInvoiceStatus } from '../../../../shared/enums/sales-invoice-status.enum';
import { SalesInvoiceType } from '../../../../shared/enums/sales-invoice-type.enum';

export class SalesInvoiceLineResponseDto {
  itemId: string;
  quantity: number;
  pricingModeSnapshot: PricingMode;
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
  accountPaymentAmount: number;
  remaining: number;
  status: SalesInvoiceStatus;
  createdBy: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export class SalesInvoiceListSummaryDto {
  totalAmount: number;
}

export class SalesInvoiceListItemResponseDto extends SalesInvoiceResponseDto {
  customerName: string | null;
}

export class SalesInvoiceListResponseDto {
  items: SalesInvoiceListItemResponseDto[];
  meta: {
    page: number;
    limit: number;
    total: number;
  };
  summary: SalesInvoiceListSummaryDto;
}

export class SalesInvoiceDetailResponseDto extends SalesInvoiceResponseDto {
  customer: CustomerResponseDto | null;
  items: ItemResponseDto[];
}
