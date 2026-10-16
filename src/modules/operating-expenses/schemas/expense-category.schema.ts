import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ExpenseCategoryDocument = HydratedDocument<ExpenseCategory>;

@Schema({ timestamps: true })
export class ExpenseCategory {
  @Prop({ type: String, default: null })
  code: string | null;

  @Prop({ type: String, default: null, trim: true })
  name: string | null;

  @Prop({ default: true })
  isActive: boolean;
}

export const ExpenseCategorySchema = SchemaFactory.createForClass(ExpenseCategory);
ExpenseCategorySchema.index({ code: 1 }, { unique: true, partialFilterExpression: { code: { $type: 'string' } } });
ExpenseCategorySchema.index({ name: 1 }, { unique: true, partialFilterExpression: { name: { $type: 'string' } } });
