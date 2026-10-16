import { IsNumber, Min, ValidateIf } from 'class-validator';
import { IsMoneyAmount } from '../../../../shared/utils/round-money/is-money-amount.decorator';

export class UpdateItemPricingDto {
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
}
