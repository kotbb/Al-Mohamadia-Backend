import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
})
export class RefreshToken {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, index: true })
  tokenHash: string;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ type: Date, default: null })
  revokedAt: Date | null;

  /** Derived — not stored. */
  isRevoked?: boolean;

  /** Derived — not stored. */
  isExpired?: boolean;

  /** Derived — not stored. `!isRevoked && !isExpired`. */
  isActive?: boolean;
}

export type RefreshTokenDocument = HydratedDocument<RefreshToken>;

export const RefreshTokenSchema = SchemaFactory.createForClass(RefreshToken);

RefreshTokenSchema.virtual('isRevoked').get(function (this: RefreshTokenDocument) {
  return this.revokedAt != null;
});

RefreshTokenSchema.virtual('isExpired').get(function (this: RefreshTokenDocument) {
  return Date.now() > this.expiresAt.getTime();
});

RefreshTokenSchema.virtual('isActive').get(function (this: RefreshTokenDocument) {
  return !this.isRevoked && !this.isExpired;
});
