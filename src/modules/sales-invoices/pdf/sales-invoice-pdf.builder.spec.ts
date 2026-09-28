import { HttpException, HttpStatus } from '@nestjs/common';
import { SalesInvoiceStatus } from '../../../shared/enums/sales-invoice-status.enum';
import { SalesInvoiceType } from '../../../shared/enums/sales-invoice-type.enum';
import { InvoicePdfInput } from '../types/invoice-pdf-input.type';
import { buildSalesInvoicePdf, closeSalesInvoicePdfBrowser } from './sales-invoice-pdf.builder';

const invoiceInput: InvoicePdfInput = {
  invoiceNumber: 'INV-0001',
  type: SalesInvoiceType.CASH_SALE,
  status: SalesInvoiceStatus.SAVED,
  createdAt: new Date('2026-03-15T12:00:00Z'),
  customerName: null,
  customerPhone: null,
  lines: [
    {
      itemLabel: 'لوح MDF (MDF-18)',
      quantity: 2,
      width: null,
      length: null,
      thickness: null,
      piecePrice: 450,
      lineTotal: 900,
      note: null,
    },
  ],
  total: 900,
  discount: 0,
  paid: 900,
  remaining: 0,
};

describe('buildSalesInvoicePdf', () => {
  beforeAll(() => {
    delete process.env.PUPPETEER_EXECUTABLE_PATH;
    delete process.env.VERCEL;
  });

  afterAll(async () => {
    await closeSalesInvoicePdfBrowser();
  });

  it('returns a non-empty PDF buffer using the local Windows browser', async () => {
    const buffer = await buildSalesInvoicePdf(invoiceInput);

    expect(buffer.length).toBeGreaterThan(100);
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
  }, 60_000);

  it('rejects a second print while one is already running', async () => {
    const first = buildSalesInvoicePdf(invoiceInput);
    const overlapping = buildSalesInvoicePdf(invoiceInput);

    await expect(overlapping).rejects.toBeInstanceOf(HttpException);
    await expect(overlapping).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });

    const buffer = await first;
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
  }, 60_000);
});
