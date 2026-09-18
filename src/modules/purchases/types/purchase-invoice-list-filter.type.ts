import { Types } from 'mongoose';
import { PurchaseInvoiceStatus } from '../../../shared/enums/purchase-invoice-status.enum';

export interface PurchaseInvoiceListFilter {
  supplierId?: Types.ObjectId;
  status?: PurchaseInvoiceStatus;
  createdAt?: {
    $gte: Date;
    $lt: Date;
  };
  invoiceNumber?: {
    $regex: string;
    $options: string;
  };
  $or?: Array<{ invoiceNumber: { $regex: string; $options: string } } | { supplierId: { $in: Types.ObjectId[] } }>;
}
