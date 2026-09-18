import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { PaymentMethod } from '../../../shared/enums/payment-method.enum';

export type SupplierPaymentDocument = HydratedDocument<SupplierPayment>;

@Schema({ timestamps: true })
export class SupplierPayment {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Supplier', required: true })
  supplierId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'PurchaseInvoice', required: false, default: null })
  purchaseInvoiceId: Types.ObjectId | null;

  @Prop({ required: true })
  amount: number;

  @Prop({
    type: String,
    enum: Object.values(PaymentMethod),
    default: PaymentMethod.CASH,
    required: true,
  })
  method: PaymentMethod;

  @Prop({ type: String, required: false, default: null, trim: true })
  notes: string | null;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  recordedBy: Types.ObjectId;

  @Prop({ type: Date, required: false, default: null })
  reversedAt: Date | null;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: false, default: null })
  reversedBy: Types.ObjectId | null;
}

export const SupplierPaymentSchema = SchemaFactory.createForClass(SupplierPayment);

SupplierPaymentSchema.index({ purchaseInvoiceId: 1 });
SupplierPaymentSchema.index({ supplierId: 1 });
SupplierPaymentSchema.index({ supplierId: 1, createdAt: -1 });
SupplierPaymentSchema.index({ reversedAt: 1 });
SupplierPaymentSchema.index({ method: 1 });
SupplierPaymentSchema.index({ createdAt: -1 });
