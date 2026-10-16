import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PaymentMethod } from '../../../../shared/enums/payment-method.enum';
import { SalesInvoiceType } from '../../../../shared/enums/sales-invoice-type.enum';
import { IsMoneyAmount } from '../../../../shared/utils/round-money/is-money-amount.decorator';

export class CreateSalesInvoiceLineDto {
  @IsMongoId()
  itemId: string;

  @IsNumber()
  @Min(0.000001)
  quantity: number;

  @ValidateIf((_, value) => value !== undefined)
  @IsNumber()
  @Min(0.000001)
  width?: number;

  @ValidateIf((_, value) => value !== undefined)
  @IsNumber()
  @Min(0.000001)
  length?: number;

  @ValidateIf((_, value) => value !== undefined)
  @IsNumber()
  @Min(0.000001)
  thickness?: number;

  @IsNumber()
  @Min(0.01)
  @IsMoneyAmount()
  piecePrice: number;

  @ValidateIf((_, value) => value !== undefined)
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

  @ValidateIf((_, value) => value !== undefined)
  @IsNumber()
  @Min(0)
  @IsMoneyAmount()
  discount?: number;

  @IsNumber()
  @Min(0)
  @IsMoneyAmount()
  paid: number;

  @ValidateIf((_, value) => value !== undefined)
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(500)
  paymentNotes?: string;
}
