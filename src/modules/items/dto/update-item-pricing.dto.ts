import { IsNumber, IsOptional, Min } from 'class-validator';

export class UpdateItemPricingDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cost?: number;
}
