import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';
import { TrimText } from '../../../../shared/utils/validation/trim-text.decorator';

export class MergeCustomersDto {
  @IsMongoId()
  targetId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsMongoId({ each: true })
  sourceIds: string[];

  @TrimText()
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  phone?: string | null;
}
