import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../../shared/auth/decorators/current-user.decorator';
import { Roles } from '../../shared/auth/decorators/roles.decorator';
import { UserRole } from '../../shared/auth/enums/user-role.enum';
import type { AuthUser } from '../../shared/auth/interfaces/auth-user.interface';
import { AuditService } from './audit.service';
import { AuditActorDto, AuditLogListResponseDto } from './dto/audit-log-response.dto';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto';

@Controller('audit-logs')
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  // GET /audit-logs/actors
  @Get('actors')
  public listActors(): Promise<AuditActorDto[]> {
    return this.auditService.listActors();
  }

  // GET /audit-logs
  @Get()
  public findAll(
    @Query() query: ListAuditLogsQueryDto,
    @CurrentUser() caller: AuthUser,
  ): Promise<AuditLogListResponseDto> {
    return this.auditService.findAll(query, caller);
  }
}
