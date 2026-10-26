import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsString, MaxLength, ValidateIf } from 'class-validator';

export class UpdatePersonalLedgerContactDto {
  @ValidateIf((value: UpdatePersonalLedgerContactDto) => value.name !== undefined)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @ValidateIf((value: UpdatePersonalLedgerContactDto) => value.isActive !== undefined)
  @IsBoolean()
  isActive?: boolean;
}
