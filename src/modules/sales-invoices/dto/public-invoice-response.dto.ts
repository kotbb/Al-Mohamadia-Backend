export class PublicInvoiceLineDto {
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
  remaining: number;
}
