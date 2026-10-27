import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { optionalBoolean } from '../../../../shared/utils/query/optional-boolean.util';

export class ListCategoriesQueryDto {
  @IsOptional()
  @Transform(optionalBoolean)
  @IsBoolean()
  includeItemCount?: boolean;
}
