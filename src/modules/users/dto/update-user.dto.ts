import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';
import { UserRole } from '../../../shared/auth/enums/user-role.enum';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  firstName?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  lastName?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  username?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @ValidateIf((_, value) => value !== undefined && value !== null && value !== '')
  @IsString()
  @MinLength(8)
  password?: string;
}
