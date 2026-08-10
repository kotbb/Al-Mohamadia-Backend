import { UserResponseDto } from '../../users/dto/user-response.dto';

export class AuthTokensResponseDto {
  accessToken: string;
  refreshToken: string;
  user: UserResponseDto;
}
