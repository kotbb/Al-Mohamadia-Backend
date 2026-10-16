import { IsEnum, IsMongoId, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { PaymentMethod } from '../../../../shared/enums/payment-method.enum';
import { IsMoneyAmount } from '../../../../shared/utils/round-money/is-money-amount.decorator';

export class RecordPaymentDto {
  @IsMongoId()
  @IsNotEmpty()
  customerId: string;

  @IsNumber()
  @Min(0.01)
  @IsMoneyAmount()
  amount: number;

  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
