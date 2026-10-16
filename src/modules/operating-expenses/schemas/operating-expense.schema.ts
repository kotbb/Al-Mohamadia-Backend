import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { PaymentMethod } from '../../../shared/enums/payment-method.enum';

export type OperatingExpenseDocument = HydratedDocument<OperatingExpense>;

@Schema({ timestamps: true })
export class OperatingExpense {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'ExpenseCategory', required: true })
  categoryId: Types.ObjectId;

  @Prop({ required: true })
  amount: number;

  @Prop({ required: true })
  expenseDate: string;

  @Prop({ type: String, enum: Object.values(PaymentMethod), required: true })
  method: PaymentMethod;

  @Prop({ type: String, default: null, trim: true })
  payee: string | null;

  @Prop({ type: String, default: null, trim: true })
  notes: string | null;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  recordedBy: Types.ObjectId;

  @Prop({ type: Boolean, default: false })
  isDeleted: boolean;
}

export const OperatingExpenseSchema = SchemaFactory.createForClass(OperatingExpense);
OperatingExpenseSchema.index({ expenseDate: -1, _id: -1 });
OperatingExpenseSchema.index({ categoryId: 1, expenseDate: -1 });
OperatingExpenseSchema.index({ isDeleted: 1, expenseDate: -1 });
