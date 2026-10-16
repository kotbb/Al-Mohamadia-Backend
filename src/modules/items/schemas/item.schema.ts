import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { PricingMode } from '../../../shared/enums/pricing-mode.enum';

export type ItemDocument = HydratedDocument<Item>;

@Schema({ _id: false })
export class ItemDimensionDefaults {
  @Prop({ type: [Number], default: [] })
  thickness: number[];

  @Prop({ type: [Number], default: [] })
  width: number[];

  @Prop({ type: [Number], default: [] })
  length: number[];
}

const ItemDimensionDefaultsSchema = SchemaFactory.createForClass(ItemDimensionDefaults);

@Schema({ timestamps: true })
export class Item {
  @Prop({ required: true, trim: true })
  code: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Category', required: true })
  categoryId: Types.ObjectId;

  @Prop({ default: false })
  isWood: boolean;

  @Prop({ type: String, required: true, enum: PricingMode })
  pricingMode: PricingMode;

  @Prop({ type: ItemDimensionDefaultsSchema, default: () => ({}) })
  dimensionDefaults: ItemDimensionDefaults;

  @Prop({ default: 0 })
  unitPrice: number;

  @Prop({ default: 0 })
  cost: number;

  @Prop({ default: 0 })
  stockQuantity: number;

  @Prop({ default: 0 })
  reorderThreshold: number;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: false })
  isDeleted: boolean;
}

export const ItemSchema = SchemaFactory.createForClass(Item);

ItemSchema.index({ code: 1 }, { unique: true, partialFilterExpression: { isDeleted: false } });
ItemSchema.index({ categoryId: 1, isDeleted: 1 });
