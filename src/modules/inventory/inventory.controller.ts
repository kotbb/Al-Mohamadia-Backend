import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../shared/auth/decorators/current-user.decorator';
import { Roles } from '../../shared/auth/decorators/roles.decorator';
import { UserRole } from '../../shared/auth/enums/user-role.enum';
import type { AuthUser } from '../../shared/auth/interfaces/auth-user.interface';
import { ParseObjectIdPipe } from '../../shared/pipes/parse-object-id/parse-object-id.pipe';
import { CreateStockAdjustmentDto } from './dto/create-stock-adjustment.dto';
import { InventoryValuationResponseDto } from './dto/inventory-valuation-response.dto';
import { ListAdjustmentsQueryDto } from './dto/list-adjustments-query.dto';
import { ListStockQueryDto } from './dto/list-stock-query.dto';
import { StockAdjustmentListResponseDto, StockAdjustmentResponseDto } from './dto/stock-adjustment-response.dto';
import { StockListResponseDto } from './dto/stock-list-response.dto';
import { InventoryService } from './inventory.service';

@Controller('inventory')
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  // GET /inventory/stock
  @Get('stock')
  public getStockList(@Query() query: ListStockQueryDto): Promise<StockListResponseDto> {
    return this.inventoryService.getStockList(query);
  }

  // GET /inventory/valuation
  @Get('valuation')
  public getValuation(): Promise<InventoryValuationResponseDto> {
    return this.inventoryService.getValuation();
  }

  // POST /inventory/adjustments
  @Post('adjustments')
  public adjustStock(
    @Body() dto: CreateStockAdjustmentDto,
    @CurrentUser() user: AuthUser,
  ): Promise<StockAdjustmentResponseDto> {
    return this.inventoryService.adjustStock(dto, user);
  }

  // GET /inventory/adjustments
  @Get('adjustments')
  public getAdjustments(@Query() query: ListAdjustmentsQueryDto): Promise<StockAdjustmentListResponseDto> {
    return this.inventoryService.getAdjustments(query);
  }

  // GET /inventory/adjustments/:id
  @Get('adjustments/:id')
  public getAdjustmentById(@Param('id', ParseObjectIdPipe) id: string): Promise<StockAdjustmentResponseDto> {
    return this.inventoryService.getAdjustmentById(id);
  }
}
