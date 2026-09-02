import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type ItemPriceHistoryDocument = HydratedDocument<ItemPriceHistory>;

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class ItemPriceHistory {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Item', required: true })
  itemId: Types.ObjectId;

  @Prop({ required: true })
  field: string;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  oldValue: unknown;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  newValue: unknown;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  changedBy: Types.ObjectId;
}

export const ItemPriceHistorySchema = SchemaFactory.createForClass(ItemPriceHistory);

ItemPriceHistorySchema.index({ itemId: 1, createdAt: -1 });
