import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../shared/auth/decorators/current-user.decorator';
import { Roles } from '../../shared/auth/decorators/roles.decorator';
import { UserRole } from '../../shared/auth/enums/user-role.enum';
import type { AuthUser } from '../../shared/auth/interfaces/auth-user.interface';
import { ParseObjectIdPipe } from '../../shared/pipes/parse-object-id/parse-object-id.pipe';
import { CreatePurchaseInvoiceDto } from './dto/create-purchase-invoice.dto';
import { ListPurchaseInvoicesQueryDto } from './dto/list-purchase-invoices-query.dto';
import { PurchaseInvoiceListResponseDto, PurchaseInvoiceResponseDto } from './dto/purchase-invoice-response.dto';
import { PurchasesService } from './purchases.service';

@Controller('purchases')
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  // POST /purchases
  @Post()
  public create(
    @Body() dto: CreatePurchaseInvoiceDto,
    @CurrentUser() user: AuthUser,
  ): Promise<PurchaseInvoiceResponseDto> {
    return this.purchasesService.create(dto, user);
  }

  // GET /purchases
  @Get()
  public findAll(@Query() query: ListPurchaseInvoicesQueryDto): Promise<PurchaseInvoiceListResponseDto> {
    return this.purchasesService.findAll(query);
  }

  // GET /purchases/:id
  @Get(':id')
  public findOne(@Param('id', ParseObjectIdPipe) id: string): Promise<PurchaseInvoiceResponseDto> {
    return this.purchasesService.findOne(id);
  }

  // POST /purchases/:id/cancel
  @Post(':id/cancel')
  public cancel(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<PurchaseInvoiceResponseDto> {
    return this.purchasesService.cancel(id, user);
  }
}
