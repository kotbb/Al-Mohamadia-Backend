import { Types } from 'mongoose';
import { PaymentMethod } from '../../../shared/enums/payment-method.enum';

export interface SupplierPaymentListFilter {
  supplierId?: Types.ObjectId;
  purchaseInvoiceId?: Types.ObjectId | null | { $ne: null };
  method?: PaymentMethod;
  reversedAt?: Date | null | { $ne: null };
  createdAt?: { $gte: Date; $lt: Date };
}
