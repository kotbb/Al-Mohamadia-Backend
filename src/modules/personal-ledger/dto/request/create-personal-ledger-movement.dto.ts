import { IsEnum, IsMongoId, IsNumber, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';
import { PaymentMethod } from '../../../../shared/enums/payment-method.enum';
import { IsMoneyAmount } from '../../../../shared/utils/round-money/is-money-amount.decorator';
import { PersonalLedgerMovementType } from '../../enums/personal-ledger-movement-type.enum';

export class CreatePersonalLedgerMovementDto {
  @IsMongoId()
  contactId: string;

  @IsEnum(PersonalLedgerMovementType)
  type: PersonalLedgerMovementType;

  @IsNumber()
  @Min(0.01)
  @IsMoneyAmount()
  amount: number;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  movementDate: string;

  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}
