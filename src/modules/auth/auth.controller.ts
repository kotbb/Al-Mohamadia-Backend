import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { Public } from '../../shared/auth/decorators/public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // POST /auth/login
  @Public()
  @Post('login')
  public login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  // POST /auth/refresh
  @Public()
  @Post('refresh')
  public refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  // POST /auth/logout
  @Public()
  @Post('logout')
  public logout(@Body() dto: RefreshDto) {
    return this.authService.logout(dto.refreshToken);
  }
}
