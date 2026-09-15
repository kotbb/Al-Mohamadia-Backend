import { Controller, Get, Header, Param, StreamableFile } from '@nestjs/common';
import { Public } from '../../shared/auth/decorators/public.decorator';
import { SkipResponseEnvelope } from '../../shared/interceptors/skip-response-envelope.decorator';
import { SalesInvoicesService } from './sales-invoices.service';
import { toPdfStreamableFile } from './utils/to-pdf-streamable-file.util';

@Controller('public/sales-invoices')
export class PublicSalesInvoicesController {
  constructor(private readonly salesInvoicesService: SalesInvoicesService) {}

  // GET /public/sales-invoices/:token/pdf
  @Public()
  @SkipResponseEnvelope()
  @Get(':token/pdf')
  @Header('Content-Type', 'application/pdf')
  public async getPdfByToken(@Param('token') token: string): Promise<StreamableFile> {
    const result = await this.salesInvoicesService.getPdfBufferByToken(token);
    return toPdfStreamableFile(result.buffer, result.invoiceNumber);
  }
}
