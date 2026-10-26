import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongoSchema, Types } from 'mongoose';

export type PersonalLedgerContactDocument = HydratedDocument<PersonalLedgerContact>;

@Schema({ timestamps: true })
export class PersonalLedgerContact {
  @Prop({ required: true, trim: true, maxlength: 200 })
  name: string;

  @Prop({ type: MongoSchema.Types.ObjectId, default: null })
  customerId: Types.ObjectId | null;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: MongoSchema.Types.ObjectId, required: true })
  createdBy: Types.ObjectId;

  @Prop({ type: MongoSchema.Types.ObjectId, required: true })
  updatedBy: Types.ObjectId;

  createdAt: Date;
  updatedAt: Date;
}

export const PersonalLedgerContactSchema = SchemaFactory.createForClass(PersonalLedgerContact);
PersonalLedgerContactSchema.index(
  { customerId: 1 },
  { unique: true, partialFilterExpression: { customerId: { $type: 'objectId' } } },
);
PersonalLedgerContactSchema.index({ isActive: 1, name: 1, _id: 1 });
