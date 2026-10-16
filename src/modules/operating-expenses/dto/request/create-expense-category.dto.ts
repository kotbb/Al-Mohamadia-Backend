import { TrimText } from '../../../../shared/utils/validation/trim-text.decorator';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateExpenseCategoryDto {
  @TrimText()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name: string;
}
