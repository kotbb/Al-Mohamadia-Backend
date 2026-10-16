import { IsEnum, IsMongoId, IsNumber, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';
import { PaymentMethod } from '../../../shared/enums/payment-method.enum';
import { IsMoneyAmount } from '../../../shared/utils/round-money/is-money-amount.decorator';

export class UpdateOperatingExpenseDto {
  @IsOptional()
  @IsMongoId()
  categoryId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  @IsMoneyAmount()
  amount?: number;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  expenseDate?: string;

  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  payee?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}
