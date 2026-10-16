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
import { TrimText } from '../../../../shared/utils/validation/trim-text.decorator';
import { Type } from 'class-transformer';
import { DimensionDefaultsDto } from './dimension-defaults.dto';
import { PricingMode } from '../../../../shared/enums/pricing-mode.enum';

export class UpdateItemDto {
  @TrimText()
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  code?: string;

  @TrimText()
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsMongoId()
  categoryId?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  isWood?: boolean;

  @ValidateIf((_, value) => value !== undefined)
  @IsEnum(PricingMode)
  pricingMode?: PricingMode;

  @ValidateIf((_, value) => value !== undefined)
  @IsObject()
  @ValidateNested()
  @Type(() => DimensionDefaultsDto)
  dimensionDefaults?: DimensionDefaultsDto;

  @ValidateIf((_, value) => value !== undefined)
  @IsNumber()
  @Min(0)
  reorderThreshold?: number;

  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  isActive?: boolean;
}
