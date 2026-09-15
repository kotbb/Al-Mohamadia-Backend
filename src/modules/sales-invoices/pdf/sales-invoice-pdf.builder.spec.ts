import { SalesInvoiceStatus } from '../../../shared/enums/sales-invoice-status.enum';
import { SalesInvoiceType } from '../../../shared/enums/sales-invoice-type.enum';
import {
  buildSalesInvoicePdf,
  closeSalesInvoicePdfBrowser,
} from './sales-invoice-pdf.builder';

describe('buildSalesInvoicePdf', () => {
  afterAll(async () => {
    await closeSalesInvoicePdfBrowser();
  });

  it(
    'returns a non-empty PDF buffer',
    async () => {
      const buffer = await buildSalesInvoicePdf({
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
      });

      expect(buffer.length).toBeGreaterThan(100);
      expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
    },
    60_000,
  );
});
