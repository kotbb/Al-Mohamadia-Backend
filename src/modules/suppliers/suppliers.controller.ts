import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { SuppliersService } from './suppliers.service';
import { CreateSupplierDto } from './dto/request/create-supplier.dto';
import { UpdateSupplierDto } from './dto/request/update-supplier.dto';
import { MergeSuppliersDto } from './dto/request/merge-suppliers.dto';
import { ListSuppliersQueryDto } from './dto/request/list-suppliers-query.dto';
import { Roles } from '../../shared/auth/decorators/roles.decorator';
import { UserRole } from '../../shared/auth/enums/user-role.enum';
import { CurrentUser } from '../../shared/auth/decorators/current-user.decorator';
import type { AuthUser } from '../../shared/auth/interfaces/auth-user.interface';
import { ParseObjectIdPipe } from '../../shared/pipes/parse-object-id/parse-object-id.pipe';

@Controller('suppliers')
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Post()
  public create(@Body() dto: CreateSupplierDto, @CurrentUser() user: AuthUser) {
    return this.suppliersService.create(dto, user);
  }

  @Post('merge')
  public merge(@Body() dto: MergeSuppliersDto, @CurrentUser() user: AuthUser) {
    return this.suppliersService.merge(dto, user);
  }

  @Get()
  public findAll(@Query() query: ListSuppliersQueryDto) {
    return this.suppliersService.findAll(query);
  }

  @Get(':id')
  public findOne(@Param('id', ParseObjectIdPipe) id: string) {
    return this.suppliersService.findOne(id);
  }

  @Patch(':id')
  public update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateSupplierDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.suppliersService.update(id, dto, user);
  }

  @Delete(':id')
  public remove(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.suppliersService.softDelete(id, user);
  }
}
