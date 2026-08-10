import { Controller, Get } from '@nestjs/common';
import { Public } from '../../shared/auth/decorators/public.decorator';

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  healthCheck() {
    return {
      status: 'ok',
    };
  }
}
