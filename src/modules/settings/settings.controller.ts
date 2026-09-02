import { Body, Controller, Get, Put } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { UpdateBaseReferencePriceDto } from './dto/update-base-reference-price.dto';
import { Roles } from '../../shared/auth/decorators/roles.decorator';
import { UserRole } from '../../shared/auth/enums/user-role.enum';
import { CurrentUser } from '../../shared/auth/decorators/current-user.decorator';
import type { AuthUser } from '../../shared/auth/interfaces/auth-user.interface';

@Controller('settings')
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  // GET /settings/base-reference-price
  @Get('base-reference-price')
  public getBaseReferencePrice() {
    return this.settingsService.getBaseReferencePrice();
  }

  // PUT /settings/base-reference-price
  @Put('base-reference-price')
  public updateBaseReferencePrice(@Body() dto: UpdateBaseReferencePriceDto, @CurrentUser() user: AuthUser) {
    return this.settingsService.updateBaseReferencePrice(dto, user);
  }
}
