import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CustomerDocument = HydratedDocument<Customer>;

@Schema({ timestamps: true })
export class Customer {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, trim: true })
  phone: string;

  @Prop({ type: String, required: false, trim: true, default: null })
  address: string | null;

  @Prop({ default: 0 })
  balance: number;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: false })
  isDeleted: boolean;
}

export const CustomerSchema = SchemaFactory.createForClass(Customer);

CustomerSchema.index({ phone: 1 }, { unique: true, partialFilterExpression: { isDeleted: false } });
CustomerSchema.index({ balance: -1 });
CustomerSchema.index({ name: 1, phone: 1 });
