import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ItemsService } from './items.service';
import { AddDimensionDefaultDto } from './dto/request/add-dimension-default.dto';
import { CreateItemDto } from './dto/request/create-item.dto';
import { UpdateItemDto } from './dto/request/update-item.dto';
import { UpdateItemPricingDto } from './dto/request/update-item-pricing.dto';
import { Roles } from '../../shared/auth/decorators/roles.decorator';
import { UserRole } from '../../shared/auth/enums/user-role.enum';
import { CurrentUser } from '../../shared/auth/decorators/current-user.decorator';
import type { AuthUser } from '../../shared/auth/interfaces/auth-user.interface';
import { ParseObjectIdPipe } from '../../shared/pipes/parse-object-id/parse-object-id.pipe';

@Controller('items')
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  // POST /items
  @Post()
  public create(@Body() dto: CreateItemDto, @CurrentUser() user: AuthUser) {
    return this.itemsService.create(dto, user);
  }

  // GET /items
  @Get()
  public findAll(@Query('categoryId') categoryId?: string, @Query('isActive') isActive?: string) {
    const parsedIsActive = isActive === undefined ? undefined : isActive === 'true';
    return this.itemsService.findAll(categoryId, parsedIsActive);
  }

  // GET /items/:id/price-history
  @Get(':id/price-history')
  public getPriceHistory(@Param('id', ParseObjectIdPipe) id: string) {
    return this.itemsService.getPriceHistory(id);
  }

  // GET /items/:id
  @Get(':id')
  public findOne(@Param('id', ParseObjectIdPipe) id: string) {
    return this.itemsService.findOne(id);
  }

  // POST /items/:id/dimension-defaults
  @Post(':id/dimension-defaults')
  public addDimensionDefault(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: AddDimensionDefaultDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.itemsService.addDimensionDefault(id, dto, user);
  }

  // PATCH /items/:id/pricing
  @Patch(':id/pricing')
  public updatePricing(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateItemPricingDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.itemsService.updatePricing(id, dto, user);
  }

  // PATCH /items/:id
  @Patch(':id')
  public update(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: UpdateItemDto, @CurrentUser() user: AuthUser) {
    return this.itemsService.update(id, dto, user);
  }

  // DELETE /items/:id (Soft Delete)
  @Delete(':id')
  public remove(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.itemsService.softDelete(id, user);
  }
}
