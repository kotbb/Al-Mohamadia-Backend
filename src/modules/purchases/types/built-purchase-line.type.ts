import { Types } from 'mongoose';
import { PurchaseInvoiceLine } from '../schemas/purchase-invoice.schema';

export interface BuiltPurchaseLine {
  itemId: string;
  stockDelta: number;
  line: PurchaseInvoiceLine & { itemId: Types.ObjectId };
}
