import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsMoneyAmount } from '../../../shared/utils/round-money/is-money-amount.decorator';

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

  @IsOptional()
  @IsNumber()
  @IsPositive()
  width?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  length?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  thickness?: number;

  @IsOptional()
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

  @IsOptional()
  @IsNumber()
  @Min(0)
  @IsMoneyAmount()
  paid?: number = 0;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
