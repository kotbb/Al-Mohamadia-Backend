import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SettingDocument = HydratedDocument<Setting>;

@Schema({ timestamps: true })
export class Setting {
  @Prop({ required: true, unique: true, trim: true })
  key: string;

  @Prop({ required: true })
  value: number;
}

export const SettingSchema = SchemaFactory.createForClass(Setting);
