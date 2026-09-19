import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type StockAdjustmentDocument = HydratedDocument<StockAdjustment>;

@Schema({
  timestamps: { createdAt: true, updatedAt: false },
})
export class StockAdjustment {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Item', required: true })
  itemId: Types.ObjectId;

  @Prop({ required: true })
  oldQuantity: number;

  @Prop({ required: true })
  newQuantity: number;

  @Prop({ required: true, trim: true })
  reason: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  adjustedBy: Types.ObjectId;
}

export const StockAdjustmentSchema = SchemaFactory.createForClass(StockAdjustment);

StockAdjustmentSchema.index({ itemId: 1, createdAt: -1 });
StockAdjustmentSchema.index({ createdAt: -1 });
