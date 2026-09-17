import { Types } from 'mongoose';
import { PaymentMethod } from '../../../shared/enums/payment-method.enum';

export type PaymentListFilter = {
  customerId?: Types.ObjectId;
  invoiceId?: Types.ObjectId | null | { $ne: null };
  reversedAt?: null | { $ne: null };
  method?: PaymentMethod;
  createdAt?: { $gte: Date; $lt: Date };
};
