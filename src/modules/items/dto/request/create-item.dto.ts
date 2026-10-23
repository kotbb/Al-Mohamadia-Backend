import {
  IsBoolean,
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsString,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { IsMoneyAmount } from '../../../../shared/utils/round-money/is-money-amount.decorator';
import { TrimText } from '../../../../shared/utils/validation/trim-text.decorator';
import { Type } from 'class-transformer';
import { DimensionDefaultsDto } from './dimension-defaults.dto';
import { PricingMode } from '../../../../shared/enums/pricing-mode.enum';

export class CreateItemDto {
  @TrimText()
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsMongoId()
  @IsNotEmpty()
  categoryId: string;

  @IsEnum(PricingMode)
  pricingMode: PricingMode;

  @ValidateIf((_, value) => value !== undefined)
  @IsObject()
  @ValidateNested()
  @Type(() => DimensionDefaultsDto)
  dimensionDefaults?: DimensionDefaultsDto;

  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  isWood?: boolean;

  @ValidateIf((_, value) => value !== undefined)
  @IsNumber()
  @Min(0)
  @IsMoneyAmount()
  unitPrice?: number;

  @ValidateIf((_, value) => value !== undefined)
  @IsNumber()
  @Min(0)
  @IsMoneyAmount()
  cost?: number;

  @ValidateIf((_, value) => value !== undefined)
  @IsNumber()
  @Min(0)
  stockQuantity?: number;

  @ValidateIf((_, value) => value !== undefined)
  @IsNumber()
  @Min(0)
  reorderThreshold?: number;

  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  isActive?: boolean;
}
