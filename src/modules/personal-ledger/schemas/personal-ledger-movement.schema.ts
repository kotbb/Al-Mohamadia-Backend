import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongoSchema, Types } from 'mongoose';
import { PaymentMethod } from '../../../shared/enums/payment-method.enum';
import { PersonalLedgerMovementType } from '../enums/personal-ledger-movement-type.enum';

export type PersonalLedgerMovementDocument = HydratedDocument<PersonalLedgerMovement>;

@Schema({ timestamps: true })
export class PersonalLedgerMovement {
  @Prop({ type: MongoSchema.Types.ObjectId, required: true })
  contactId: Types.ObjectId;

  @Prop({ type: String, enum: PersonalLedgerMovementType, required: true })
  type: PersonalLedgerMovementType;

  @Prop({ required: true, min: 0.01 })
  amount: number;

  @Prop({ required: true })
  movementDate: string;

  @Prop({ type: String, enum: [...Object.values(PaymentMethod), null], default: null })
  method: PaymentMethod | null;

  @Prop({ type: String, trim: true, default: null, maxlength: 500 })
  notes: string | null;

  @Prop({ default: false })
  isDeleted: boolean;

  @Prop({ type: MongoSchema.Types.ObjectId, required: true })
  createdBy: Types.ObjectId;

  @Prop({ type: MongoSchema.Types.ObjectId, required: true })
  updatedBy: Types.ObjectId;

  createdAt: Date;
  updatedAt: Date;
}

export const PersonalLedgerMovementSchema = SchemaFactory.createForClass(PersonalLedgerMovement);
PersonalLedgerMovementSchema.index({ isDeleted: 1, movementDate: -1, createdAt: -1, _id: -1 });
PersonalLedgerMovementSchema.index({ contactId: 1, isDeleted: 1, movementDate: -1, createdAt: -1, _id: -1 });
