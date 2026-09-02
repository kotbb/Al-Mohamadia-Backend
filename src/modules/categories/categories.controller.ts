import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { Roles } from '../../shared/auth/decorators/roles.decorator';
import { UserRole } from '../../shared/auth/enums/user-role.enum';
import { CurrentUser } from '../../shared/auth/decorators/current-user.decorator';
import type { AuthUser } from '../../shared/auth/interfaces/auth-user.interface';
import { ParseObjectIdPipe } from '../../shared/pipes/parse-object-id/parse-object-id.pipe';

@Controller('categories')
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  // POST /categories
  @Post()
  public create(@Body() dto: CreateCategoryDto, @CurrentUser() user: AuthUser) {
    return this.categoriesService.create(dto, user);
  }

  // GET /categories
  @Get()
  public findAll() {
    return this.categoriesService.findAll();
  }

  // GET /categories/:id
  @Get(':id')
  public findOne(@Param('id', ParseObjectIdPipe) id: string) {
    return this.categoriesService.findOne(id);
  }

  // PATCH /categories/:id 
  @Patch(':id')
  public update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateCategoryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.categoriesService.update(id, dto, user);
  }

  // DELETE /categories/:id 
  @Delete(':id')
  public remove(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.categoriesService.softDelete(id, user);
  }
}
