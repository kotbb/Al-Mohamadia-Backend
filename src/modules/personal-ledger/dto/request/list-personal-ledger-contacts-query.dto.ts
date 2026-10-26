import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { PersonalLedgerPaginationQueryDto } from './personal-ledger-pagination-query.dto';

export class ListPersonalLedgerContactsQueryDto extends PersonalLedgerPaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  includeInactive?: boolean;
}
