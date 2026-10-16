import { TrimText } from '../../../../shared/utils/validation/trim-text.decorator';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class CreateAdminDto {
  @TrimText()
  @IsString()
  @IsNotEmpty()
  username: string;

  @TrimText()
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @TrimText()
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @IsString()
  @MinLength(8)
  password: string;
}
