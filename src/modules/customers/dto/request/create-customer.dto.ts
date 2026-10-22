import { IsNotEmpty, IsNumber, IsOptional, IsString, ValidateIf } from 'class-validator';
import { IsMoneyAmount } from '../../../../shared/utils/round-money/is-money-amount.decorator';
import { TrimText } from '../../../../shared/utils/validation/trim-text.decorator';

export class CreateCustomerDto {
  @TrimText()
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  phone?: string | null;

  @IsOptional()
  @IsString()
  address?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsNumber()
  @IsMoneyAmount()
  balance?: number;
}
