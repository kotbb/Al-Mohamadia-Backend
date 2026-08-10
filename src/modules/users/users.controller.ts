import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateAdminDto } from './dto/create-admin.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Roles } from '../../shared/auth/decorators/roles.decorator';
import { UserRole } from '../../shared/auth/enums/user-role.enum';
import { CurrentUser } from '../../shared/auth/decorators/current-user.decorator';
import type { AuthUser } from '../../shared/auth/interfaces/auth-user.interface';
import { ParseObjectIdPipe } from '../../shared/pipes/parse-object-id/parse-object-id.pipe';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN)
  public create(@Body() dto: CreateAdminDto, @CurrentUser() user: AuthUser) {
    return this.usersService.createAdmin(dto, user);
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN)
  public getAll() {
    return this.usersService.findAll();
  }

  @Get('me')
  public getMe(@CurrentUser() user: AuthUser) {
    return this.usersService.findMe(user.id);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN)
  public update(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.updateActiveStatus(id, dto);
  }
}
