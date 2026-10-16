import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateAdminDto } from './dto/request/create-admin.dto';
import { UpdateUserDto } from './dto/request/update-user.dto';
import { Roles } from '../../shared/auth/decorators/roles.decorator';
import { UserRole } from '../../shared/auth/enums/user-role.enum';
import { CurrentUser } from '../../shared/auth/decorators/current-user.decorator';
import type { AuthUser } from '../../shared/auth/interfaces/auth-user.interface';
import { ParseObjectIdPipe } from '../../shared/pipes/parse-object-id/parse-object-id.pipe';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // POST /users (SUPER ADMIN)
  @Post()
  @Roles(UserRole.SUPER_ADMIN)
  public create(@Body() dto: CreateAdminDto, @CurrentUser() user: AuthUser) {
    return this.usersService.createAdmin(dto, user);
  }

  // GET /users (SUPER ADMIN)
  @Get()
  @Roles(UserRole.SUPER_ADMIN)
  public getAll() {
    return this.usersService.findAll();
  }

  // GET /users/me (SUPER ADMIN, ADMIN)
  @Get('me')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  public getMe(@CurrentUser() user: AuthUser) {
    return this.usersService.findMe(user.id);
  }

  // PATCH /users/:id (SUPER ADMIN)
  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN)
  public update(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: UpdateUserDto, @CurrentUser() user: AuthUser) {
    return this.usersService.updateUser(id, dto, user);
  }

  // DELETE /users/:id (SUPER ADMIN)
  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN)
  public remove(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.usersService.softDelete(id, user);
  }
}
