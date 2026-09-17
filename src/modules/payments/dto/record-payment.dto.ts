import { IsEnum, IsMongoId, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { PaymentMethod } from '../../../shared/enums/payment-method.enum';

export class RecordPaymentDto {
  @IsMongoId()
  @IsNotEmpty()
  customerId: string;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @IsOptional()
  @IsString()
  notes?: string;
}
