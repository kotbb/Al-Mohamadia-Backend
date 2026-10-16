import { TrimText } from '../../../../shared/utils/validation/trim-text.decorator';
import { ValidateIf } from 'class-validator';
import { IsBoolean, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UpdateExpenseCategoryDto {
  @TrimText()
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  isActive?: boolean;
}
