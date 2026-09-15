import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { SalesInvoiceStatus } from '../../../shared/enums/sales-invoice-status.enum';
import { SalesInvoiceType } from '../../../shared/enums/sales-invoice-type.enum';

export type SalesInvoiceDocument = HydratedDocument<SalesInvoice>;

@Schema({ _id: false })
export class SalesInvoiceLine {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Item', required: true })
  itemId: Types.ObjectId;

  @Prop({ required: true })
  quantity: number;

  @Prop({ type: Number, required: false, default: null })
  width: number | null;

  @Prop({ type: Number, required: false, default: null })
  length: number | null;

  @Prop({ type: Number, required: false, default: null })
  thickness: number | null;

  @Prop({ required: true })
  piecePrice: number;

  @Prop({ required: true })
  costPriceSnapshot: number;

  @Prop({ required: true })
  lineTotal: number;

  @Prop({ type: String, required: false, trim: true, default: null })
  note: string | null;
}

export const SalesInvoiceLineSchema = SchemaFactory.createForClass(SalesInvoiceLine);

@Schema({ timestamps: true })
export class SalesInvoice {
  @Prop({ required: true, trim: true })
  invoiceNumber: string;

  @Prop({ type: String, required: true, enum: SalesInvoiceType })
  type: SalesInvoiceType;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Customer', required: false, default: null })
  customerId: Types.ObjectId | null;

  @Prop({ type: [SalesInvoiceLineSchema], required: true, default: [] })
  lines: SalesInvoiceLine[];

  @Prop({ required: true })
  total: number;

  @Prop({ default: 0 })
  discount: number;

  @Prop({ default: 0 })
  paid: number;

  @Prop({ required: true })
  remaining: number;

  @Prop({ type: String, required: true, enum: SalesInvoiceStatus, default: SalesInvoiceStatus.SAVED })
  status: SalesInvoiceStatus;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;

  @Prop({ type: String, required: false, default: null, trim: true })
  pdfShareToken: string | null;
}

export const SalesInvoiceSchema = SchemaFactory.createForClass(SalesInvoice);

SalesInvoiceSchema.index({ invoiceNumber: 1 }, { unique: true });
SalesInvoiceSchema.index({ createdAt: -1 });
SalesInvoiceSchema.index({ customerId: 1 });
SalesInvoiceSchema.index({ status: 1 });
SalesInvoiceSchema.index(
  { pdfShareToken: 1 },
  { unique: true, partialFilterExpression: { pdfShareToken: { $type: 'string' } } },
);