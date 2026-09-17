import { Body, Controller, Get, Header, Param, Post, Query, StreamableFile } from '@nestjs/common';
import { SalesInvoicesService } from './sales-invoices.service';
import { CreateSalesInvoiceDto } from './dto/create-sales-invoice.dto';
import { ListSalesInvoicesQueryDto } from './dto/list-sales-invoices-query.dto';
import { Roles } from '../../shared/auth/decorators/roles.decorator';
import { UserRole } from '../../shared/auth/enums/user-role.enum';
import { CurrentUser } from '../../shared/auth/decorators/current-user.decorator';
import type { AuthUser } from '../../shared/auth/interfaces/auth-user.interface';
import { ParseObjectIdPipe } from '../../shared/pipes/parse-object-id/parse-object-id.pipe';
import { SkipResponseEnvelope } from '../../shared/interceptors/skip-response-envelope.decorator';
import { toPdfStreamableFile } from './utils/to-pdf-streamable-file.util';

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

  // GET /sales-invoices/:id/pdf
  @Get(':id/pdf')
  @SkipResponseEnvelope()
  @Header('Content-Type', 'application/pdf')
  public async getPdf(@Param('id', ParseObjectIdPipe) id: string): Promise<StreamableFile> {
    const result = await this.salesInvoicesService.getPdfBufferById(id);
    return toPdfStreamableFile(result.buffer, result.invoiceNumber);
  }

  // GET /sales-invoices/:id/share
  @Get(':id/share')
  public getShare(@Param('id', ParseObjectIdPipe) id: string) {
    return this.salesInvoicesService.getSharePayload(id);
  }

  // GET /sales-invoices/:id
  @Get(':id')
  public findOne(@Param('id', ParseObjectIdPipe) id: string) {
    return this.salesInvoicesService.findOne(id);
  }

  // POST /sales-invoices/:id/cancel
  @Post(':id/cancel')
  public cancel(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.salesInvoicesService.cancel(id, user);
  }
}
