import { UserResponseDto } from '../../../users/dto/response/user-response.dto';

export class AuthTokensResponseDto {
  accessToken: string;
  refreshToken: string;
  user: UserResponseDto;
}
