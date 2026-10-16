import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/request/create-customer.dto';
import { UpdateCustomerDto } from './dto/request/update-customer.dto';
import { MergeCustomersDto } from './dto/request/merge-customers.dto';
import { ListCustomersQueryDto } from './dto/request/list-customers-query.dto';
import { Roles } from '../../shared/auth/decorators/roles.decorator';
import { UserRole } from '../../shared/auth/enums/user-role.enum';
import { CurrentUser } from '../../shared/auth/decorators/current-user.decorator';
import type { AuthUser } from '../../shared/auth/interfaces/auth-user.interface';
import { ParseObjectIdPipe } from '../../shared/pipes/parse-object-id/parse-object-id.pipe';

@Controller('customers')
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post()
  public create(@Body() dto: CreateCustomerDto, @CurrentUser() user: AuthUser) {
    return this.customersService.create(dto, user);
  }

  @Post('merge')
  public merge(@Body() dto: MergeCustomersDto, @CurrentUser() user: AuthUser) {
    return this.customersService.merge(dto, user);
  }

  @Get()
  public findAll(@Query() query: ListCustomersQueryDto) {
    return this.customersService.findAll(query);
  }

  @Get(':id')
  public findOne(@Param('id', ParseObjectIdPipe) id: string) {
    return this.customersService.findOne(id);
  }

  @Patch(':id')
  public update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateCustomerDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.customersService.update(id, dto, user);
  }

  @Delete(':id')
  public remove(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.customersService.softDelete(id, user);
  }
}
