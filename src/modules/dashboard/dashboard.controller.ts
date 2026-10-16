import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../../shared/auth/decorators/roles.decorator';
import { UserRole } from '../../shared/auth/enums/user-role.enum';
import { DashboardService } from './dashboard.service';
import { DashboardResponseDto } from './dto/response/dashboard-response.dto';
import { GetDashboardQueryDto } from './dto/request/get-dashboard-query.dto';

@Controller('dashboard')
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  // GET /dashboard
  @Get()
  public getDashboard(@Query() query: GetDashboardQueryDto): Promise<DashboardResponseDto> {
    return this.dashboardService.getDashboard(query);
  }
}
