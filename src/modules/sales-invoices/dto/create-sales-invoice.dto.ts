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
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PaymentMethod } from '../../../shared/enums/payment-method.enum';
import { SalesInvoiceType } from '../../../shared/enums/sales-invoice-type.enum';
import { IsMoneyAmount } from '../../../shared/utils/round-money/is-money-amount.decorator';

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
  @IsMoneyAmount()
  piecePrice: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
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
  @IsMoneyAmount()
  discount?: number;

  @IsNumber()
  @Min(0)
  @IsMoneyAmount()
  paid: number;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  paymentNotes?: string;
}
