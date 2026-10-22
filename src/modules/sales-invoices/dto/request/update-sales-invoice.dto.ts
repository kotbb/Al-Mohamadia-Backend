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
import { CreateSalesInvoiceLineDto } from './create-sales-invoice.dto';

export class UpdateSalesInvoiceDto {
  @IsEnum(SalesInvoiceType)
  type: SalesInvoiceType;

  @ValidateIf((o: UpdateSalesInvoiceDto) => o.type === SalesInvoiceType.CUSTOMER_SALE)
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
  @IsNumber()
  @Min(0)
  @IsMoneyAmount()
  accountPaymentAmount?: number;

  @ValidateIf((_, value) => value !== undefined)
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(500)
  paymentNotes?: string;
}
