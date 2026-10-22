import { IsMoneyAmount } from '../../../../shared/utils/round-money/is-money-amount.decorator';
import { IsNumber, IsBoolean, IsNotEmpty, IsOptional, IsString, ValidateIf } from 'class-validator';
import { TrimText } from '../../../../shared/utils/validation/trim-text.decorator';

export class UpdateSupplierDto {
  @TrimText()
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  phone?: string | null;

  @IsOptional()
  @IsString()
  address?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  isActive?: boolean;
  @ValidateIf((_, value) => value !== undefined)
  @IsNumber()
  @IsMoneyAmount()
  amountOwed?: number;
}
