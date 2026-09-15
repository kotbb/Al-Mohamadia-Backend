import { SalesInvoiceStatus } from '../../../shared/enums/sales-invoice-status.enum';
import { SalesInvoiceType } from '../../../shared/enums/sales-invoice-type.enum';

export type InvoicePdfLineInput = {
  itemLabel: string;
  quantity: number;
  width: number | null;
  length: number | null;
  thickness: number | null;
  piecePrice: number;
  lineTotal: number;
  note: string | null;
};

export type InvoicePdfInput = {
  invoiceNumber: string;
  type: SalesInvoiceType;
  status: SalesInvoiceStatus;
  createdAt: Date;
  customerName: string | null;
  customerPhone: string | null;
  lines: InvoicePdfLineInput[];
  total: number;
  discount: number;
  paid: number;
  remaining: number;
};
