import { IsMongoId, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { PersonalLedgerPaginationQueryDto } from './personal-ledger-pagination-query.dto';

export class ListPersonalLedgerMovementsQueryDto extends PersonalLedgerPaginationQueryDto {
  @IsOptional()
  @IsMongoId()
  contactId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;
}
