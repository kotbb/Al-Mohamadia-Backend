import { ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsMongoId,
  IsNumber,
  IsPositive,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsMoneyAmount } from '../../../../shared/utils/round-money/is-money-amount.decorator';

export class CreatePurchaseInvoiceLineDto {
  @IsMongoId()
  itemId: string;

  @IsNumber()
  @IsPositive()
  quantity: number;

  @IsNumber()
  @IsPositive()
  @IsMoneyAmount()
  unitCost: number;

  @ValidateIf((_, value) => value !== undefined)
  @IsNumber()
  @IsPositive()
  width?: number;

  @ValidateIf((_, value) => value !== undefined)
  @IsNumber()
  @IsPositive()
  length?: number;

  @ValidateIf((_, value) => value !== undefined)
  @IsNumber()
  @IsPositive()
  thickness?: number;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class CreatePurchaseInvoiceDto {
  @IsMongoId()
  supplierId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseInvoiceLineDto)
  lines: CreatePurchaseInvoiceLineDto[];

  @ValidateIf((_, value) => value !== undefined)
  @IsNumber()
  @Min(0)
  @IsMoneyAmount()
  paid?: number = 0;

  @ValidateIf((_, value) => value !== undefined)
  @IsNumber()
  @Min(0)
  @IsMoneyAmount()
  accountPaymentAmount?: number;

  @ValidateIf((_, value) => value !== undefined)
  @IsNumber()
  @Min(0)
  @IsMoneyAmount()
  existingDebtPayment?: number;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(500)
  notes?: string;
}
