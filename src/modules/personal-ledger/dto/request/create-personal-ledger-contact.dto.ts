import { Transform } from 'class-transformer';
import { IsMongoId, IsNotEmpty, IsString, MaxLength, ValidateIf } from 'class-validator';

export class CreatePersonalLedgerContactDto {
  @ValidateIf((value: CreatePersonalLedgerContactDto) => value.name !== undefined)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @ValidateIf((value: CreatePersonalLedgerContactDto) => value.customerId !== undefined)
  @IsMongoId()
  customerId?: string;
}
