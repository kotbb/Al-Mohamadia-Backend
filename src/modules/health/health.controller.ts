import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../shared/auth/decorators/public.decorator';

@Controller('health')
@SkipThrottle()
export class HealthController {
  @Public()
  @Get()
  healthCheck() {
    return {
      status: 'ok',
    };
  }
}
