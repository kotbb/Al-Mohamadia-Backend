import { TrimText } from '../../../../shared/utils/validation/trim-text.decorator';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateCategoryDto {
  @TrimText()
  @IsString()
  @IsNotEmpty()
  name: string;
}
