import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../shared/auth/decorators/current-user.decorator';
import { Roles } from '../../shared/auth/decorators/roles.decorator';
import { UserRole } from '../../shared/auth/enums/user-role.enum';
import type { AuthUser } from '../../shared/auth/interfaces/auth-user.interface';
import { ParseObjectIdPipe } from '../../shared/pipes/parse-object-id/parse-object-id.pipe';
import { CreateExpenseCategoryDto } from './dto/create-expense-category.dto';
import { CreateOperatingExpenseDto } from './dto/create-operating-expense.dto';
import { ListOperatingExpensesQueryDto } from './dto/list-operating-expenses-query.dto';
import { UpdateExpenseCategoryDto } from './dto/update-expense-category.dto';
import { UpdateOperatingExpenseDto } from './dto/update-operating-expense.dto';
import { OperatingExpensesService } from './operating-expenses.service';

@Controller('operating-expenses')
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class OperatingExpensesController {
  constructor(private readonly service: OperatingExpensesService) {}

  // GET /operating-expenses/categories
  @Get('categories')
  listCategories() {
    return this.service.listCategories();
  }

  // POST /operating-expenses/categories
  @Post('categories')
  createCategory(@Body() dto: CreateExpenseCategoryDto, @CurrentUser() user: AuthUser) {
    return this.service.createCategory(dto, user);
  }

  // PATCH /operating-expenses/categories/:id
  @Patch('categories/:id')
  updateCategory(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateExpenseCategoryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.updateCategory(id, dto, user);
  }

  // GET /operating-expenses
  @Get()
  list(@Query() query: ListOperatingExpensesQueryDto) {
    return this.service.listExpenses(query);
  }

  // POST /operating-expenses
  @Post()
  create(@Body() dto: CreateOperatingExpenseDto, @CurrentUser() user: AuthUser) {
    return this.service.createExpense(dto, user);
  }

  // GET /operating-expenses/:id
  @Get(':id')
  get(@Param('id', ParseObjectIdPipe) id: string) {
    return this.service.getExpense(id);
  }

  // PATCH /operating-expenses/:id
  @Patch(':id')
  update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateOperatingExpenseDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.updateExpense(id, dto, user);
  }

  // DELETE /operating-expenses/:id
  @Delete(':id')
  delete(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.deleteExpense(id, user);
  }
}
