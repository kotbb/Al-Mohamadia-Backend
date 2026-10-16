import { IsBoolean, IsNotEmpty, IsString, ValidateIf } from 'class-validator';
import { TrimText } from '../../../../shared/utils/validation/trim-text.decorator';

export class UpdateCategoryDto {
  @TrimText()
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  isActive?: boolean;
}
