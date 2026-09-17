import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PaymentMethod } from '../../../shared/enums/payment-method.enum';
import { SalesInvoiceType } from '../../../shared/enums/sales-invoice-type.enum';

export class CreateSalesInvoiceLineDto {
  @IsMongoId()
  itemId: string;

  @IsNumber()
  @Min(0.000001)
  quantity: number;

  @IsOptional()
  @IsNumber()
  @Min(0.000001)
  width?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.000001)
  length?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.000001)
  thickness?: number;

  @IsNumber()
  @Min(0.01)
  piecePrice: number;

  @IsOptional()
  @IsString()
  note?: string;
}

export class CreateSalesInvoiceDto {
  @IsEnum(SalesInvoiceType)
  type: SalesInvoiceType;

  @ValidateIf((o: CreateSalesInvoiceDto) => o.type === SalesInvoiceType.CUSTOMER_SALE)
  @IsMongoId()
  @IsNotEmpty()
  customerId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSalesInvoiceLineDto)
  lines: CreateSalesInvoiceLineDto[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @IsNumber()
  @Min(0)
  paid: number;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsString()
  paymentNotes?: string;
}
