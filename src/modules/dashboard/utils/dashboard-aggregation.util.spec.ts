import { SalesInvoiceStatus } from '../../../shared/enums/sales-invoice-status.enum';
import {
  buildSalesHeaderPipeline,
  buildSalesCogsPipeline,
  buildTopSellingItemsPipeline,
} from './dashboard-aggregation.util';

describe('dashboard aggregation builders', () => {
  const from = new Date('2026-10-13T21:00:00Z');
  const to = new Date('2026-10-14T21:00:00Z');

  it.each([buildSalesHeaderPipeline, buildSalesCogsPipeline, buildTopSellingItemsPipeline])(
    'limits saved invoices to the requested half-open range',
    (build) => {
      expect(build(from, to)[0]).toEqual({
        $match: { status: SalesInvoiceStatus.SAVED, createdAt: { $gte: from, $lt: to } },
      });
    },
  );

  it('returns independent pipelines without leaking mutations between callers', () => {
    const first = buildSalesCogsPipeline(from, to);
    const original = structuredClone(first);
    first.pop();
    expect(buildSalesCogsPipeline(from, to)).toEqual(original);
  });
});
