import { Controller, Get, Param } from '@nestjs/common';
import { Public } from '../../shared/auth/decorators/public.decorator';
import { SalesInvoicesService } from './sales-invoices.service';

@Controller('public/sales-invoices')
export class PublicSalesInvoicesController {
  constructor(private readonly salesInvoicesService: SalesInvoicesService) {}

  // GET /api/v1/public/sales-invoices/:token
  @Public()
  @Get(':token')
  public getByToken(@Param('token') token: string) {
    return this.salesInvoicesService.getPublicInvoiceByToken(token);
  }
}
