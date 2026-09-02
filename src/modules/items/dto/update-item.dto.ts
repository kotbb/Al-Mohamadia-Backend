import { IsBoolean, IsEnum, IsMongoId, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { PricingMode } from '../../../shared/enums/pricing-mode.enum';

export class UpdateItemDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsMongoId()
  categoryId?: string;

  @IsOptional()
  @IsBoolean()
  isWood?: boolean;

  @IsOptional()
  @IsEnum(PricingMode)
  pricingMode?: PricingMode;

  @IsOptional()
  @IsNumber()
  @Min(0)
  reorderThreshold?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
