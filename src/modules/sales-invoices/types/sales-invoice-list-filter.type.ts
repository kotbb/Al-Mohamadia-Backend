import { Types } from 'mongoose';
import { SalesInvoiceStatus } from '../../../shared/enums/sales-invoice-status.enum';

export type SalesInvoiceListFilter = {
  customerId?: Types.ObjectId;
  status?: SalesInvoiceStatus;
  createdAt?: { $gte: Date; $lt: Date };
  $or?: Array<{ invoiceNumber: { $regex: string; $options: string } } | { customerId: { $in: Types.ObjectId[] } }>;
};
