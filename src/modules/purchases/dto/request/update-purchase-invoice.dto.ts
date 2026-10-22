import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsMongoId,
  IsNumber,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { IsMoneyAmount } from '../../../../shared/utils/round-money/is-money-amount.decorator';
import { CreatePurchaseInvoiceLineDto } from './create-purchase-invoice.dto';

export class UpdatePurchaseInvoiceDto {
  @IsMongoId()
  supplierId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseInvoiceLineDto)
  lines: CreatePurchaseInvoiceLineDto[];

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
  @IsString()
  @MaxLength(500)
  notes?: string;
}
