import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { PaymentMethod } from '../../../shared/enums/payment-method.enum';

export type PaymentDocument = HydratedDocument<Payment>;

@Schema({ timestamps: true })
export class Payment {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Customer', required: false, default: null })
  customerId: Types.ObjectId | null;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'SalesInvoice', required: false, default: null })
  invoiceId: Types.ObjectId | null;

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

export const PaymentSchema = SchemaFactory.createForClass(Payment);

PaymentSchema.index({ invoiceId: 1 });
PaymentSchema.index({ customerId: 1 });
PaymentSchema.index({ customerId: 1, createdAt: -1 });
PaymentSchema.index({ reversedAt: 1 });
PaymentSchema.index({ method: 1 });
PaymentSchema.index({ createdAt: -1 });
