import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SupplierDocument = HydratedDocument<Supplier>;

@Schema({ timestamps: true })
export class Supplier {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: String, required: false, trim: true, default: null })
  phone: string | null;

  @Prop({ type: String, required: false, trim: true, default: null })
  address: string | null;

  @Prop({ default: 0 })
  amountOwed: number;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: false })
  isDeleted: boolean;
}

export const SupplierSchema = SchemaFactory.createForClass(Supplier);

SupplierSchema.index(
  { phone: 1 },
  {
    unique: true,
    partialFilterExpression: {
      isDeleted: false,
      phone: { $type: 'string' },
    },
  },
);
SupplierSchema.index({ amountOwed: -1 });
SupplierSchema.index({ name: 1, phone: 1 });
