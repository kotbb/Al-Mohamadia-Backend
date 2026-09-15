import { SalesInvoiceLine } from '../schemas/sales-invoice.schema';

export type BuiltLine = {
  line: SalesInvoiceLine;
  stockDelta: number;
  itemId: string;
};
