import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { PricingMode } from '../../../shared/enums/pricing-mode.enum';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { PurchaseInvoiceStatus } from '../../../shared/enums/purchase-invoice-status.enum';

export type PurchaseInvoiceDocument = HydratedDocument<PurchaseInvoice>;

@Schema({ _id: false })
export class PurchaseInvoiceLine {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Item', required: true })
  itemId: Types.ObjectId;

  @Prop({ required: true })
  quantity: number;

  @Prop({ type: String, enum: PricingMode, required: false })
  pricingModeSnapshot?: PricingMode;

  @Prop({ type: Number, required: false, default: null })
  width: number | null;

  @Prop({ type: Number, required: false, default: null })
  length: number | null;

  @Prop({ type: Number, required: false, default: null })
  thickness: number | null;

  @Prop({ required: true })
  unitCost: number;

  @Prop({ required: true })
  lineTotal: number;

  @Prop({ type: String, required: false, trim: true, default: null })
  note: string | null;
}

export const PurchaseInvoiceLineSchema = SchemaFactory.createForClass(PurchaseInvoiceLine);

@Schema({ timestamps: true })
export class PurchaseInvoice {
  @Prop({ required: true, trim: true })
  invoiceNumber: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Supplier', required: true })
  supplierId: Types.ObjectId;

  @Prop({ type: [PurchaseInvoiceLineSchema], required: true, default: [] })
  lines: PurchaseInvoiceLine[];

  @Prop({ required: true })
  total: number;

  @Prop({ default: 0 })
  paid: number;

  @Prop({ required: true })
  remaining: number;

  @Prop({ type: String, required: true, enum: PurchaseInvoiceStatus, default: PurchaseInvoiceStatus.SAVED })
  status: PurchaseInvoiceStatus;

  @Prop({ type: String, required: false, default: null, trim: true })
  notes: string | null;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;
}

export const PurchaseInvoiceSchema = SchemaFactory.createForClass(PurchaseInvoice);

PurchaseInvoiceSchema.index({ invoiceNumber: 1 }, { unique: true });
PurchaseInvoiceSchema.index({ createdAt: -1 });
PurchaseInvoiceSchema.index({ supplierId: 1 });
PurchaseInvoiceSchema.index({ status: 1 });
