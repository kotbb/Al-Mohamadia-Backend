import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { SalesInvoicesService } from './sales-invoices.service';
import { CreateSalesInvoiceDto } from './dto/request/create-sales-invoice.dto';
import { UpdateSalesInvoiceDto } from './dto/request/update-sales-invoice.dto';
import { ListSalesInvoicesQueryDto } from './dto/request/list-sales-invoices-query.dto';
import { Roles } from '../../shared/auth/decorators/roles.decorator';
import { UserRole } from '../../shared/auth/enums/user-role.enum';
import { CurrentUser } from '../../shared/auth/decorators/current-user.decorator';
import type { AuthUser } from '../../shared/auth/interfaces/auth-user.interface';
import { ParseObjectIdPipe } from '../../shared/pipes/parse-object-id/parse-object-id.pipe';

@Controller('sales-invoices')
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class SalesInvoicesController {
  constructor(private readonly salesInvoicesService: SalesInvoicesService) {}

  // POST /sales-invoices
  @Post()
  public create(@Body() dto: CreateSalesInvoiceDto, @CurrentUser() user: AuthUser) {
    return this.salesInvoicesService.create(dto, user);
  }

  // GET /sales-invoices
  @Get()
  public findAll(@Query() query: ListSalesInvoicesQueryDto) {
    return this.salesInvoicesService.findAll(query);
  }

  // GET /sales-invoices/:id/share
  @Get(':id/share')
  public getShare(@Param('id', ParseObjectIdPipe) id: string) {
    return this.salesInvoicesService.getSharePayload(id);
  }

  // GET /sales-invoices/:id/receipt
  @Get(':id/receipt')
  public getReceipt(@Param('id', ParseObjectIdPipe) id: string) {
    return this.salesInvoicesService.getReceipt(id);
  }

  // GET /sales-invoices/:id/neighbors
  @Get(':id/neighbors')
  public getNeighbors(@Param('id', ParseObjectIdPipe) id: string) {
    return this.salesInvoicesService.getNeighbors(id);
  }

  // GET /sales-invoices/:id
  @Get(':id')
  public findOne(@Param('id', ParseObjectIdPipe) id: string) {
    return this.salesInvoicesService.findOne(id);
  }

  // PATCH /sales-invoices/:id
  @Patch(':id')
  public update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateSalesInvoiceDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.salesInvoicesService.update(id, dto, user);
  }

  // POST /sales-invoices/:id/cancel
  @Post(':id/cancel')
  public cancel(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.salesInvoicesService.cancel(id, user);
  }
}
