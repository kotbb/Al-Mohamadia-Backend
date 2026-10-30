import { BadRequestException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { SalesInvoicePeriod } from '../../shared/enums/sales-invoice-period.enum';
import { SalesInvoiceStatus } from '../../shared/enums/sales-invoice-status.enum';
import { formatCairoDate } from '../../shared/utils/period/cairo-period.util';
import { Customer } from '../customers/schemas/customer.schema';
import { Item } from '../items/schemas/item.schema';
import { Payment } from '../payments/schemas/payment.schema';
import { PurchaseInvoice } from '../purchases/schemas/purchase-invoice.schema';
import { SalesInvoice } from '../sales-invoices/schemas/sales-invoice.schema';
import { DashboardService } from './dashboard.service';
import { GetDashboardQueryDto } from './dto/request/get-dashboard-query.dto';

function pipelineIncludesRound6(pipeline: unknown[]): boolean {
  const json = JSON.stringify(pipeline);
  return json.includes('"$round"') && json.includes(',6');
}

describe('DashboardService', () => {
  let service: DashboardService;
  let salesInvoiceModel: {
    aggregate: jest.Mock;
    find: jest.Mock;
  };
  let paymentModel: {
    aggregate: jest.Mock;
  };
  let customerModel: {
    aggregate: jest.Mock;
  };
  let itemModel: {
    find: jest.Mock;
  };
  let purchaseInvoiceModel: { aggregate: jest.Mock };

  const mockQuery = <T>(val: T) => ({
    select: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(val),
  });

  beforeEach(async () => {
    purchaseInvoiceModel = { aggregate: jest.fn().mockResolvedValue([]) };
    salesInvoiceModel = {
      aggregate: jest.fn().mockResolvedValue([]),
      find: jest.fn(),
    };
    paymentModel = {
      aggregate: jest.fn(),
    };
    customerModel = {
      aggregate: jest.fn(),
    };
    itemModel = {
      find: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: getModelToken(SalesInvoice.name), useValue: salesInvoiceModel },
        { provide: getModelToken(Payment.name), useValue: paymentModel },
        { provide: getModelToken(Customer.name), useValue: customerModel },
        { provide: getModelToken(Item.name), useValue: itemModel },
        { provide: getModelToken(PurchaseInvoice.name), useValue: purchaseInvoiceModel },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
  });

  const stubEmptyAggregates = () => {
    // today header + today cogs + top items (3 salesInvoice aggregates in parallel paths)
    salesInvoiceModel.aggregate
      .mockResolvedValueOnce([]) // today header
      .mockResolvedValueOnce([]) // today cogs
      .mockResolvedValueOnce([]); // top items
    paymentModel.aggregate.mockResolvedValue([]);
    customerModel.aggregate.mockResolvedValue([]);
    salesInvoiceModel.find.mockReturnValue(mockQuery([]));
    itemModel.find.mockReturnValue(mockQuery([]));
  };

  describe('getDashboard validation & defaults', () => {
    it('subtracts saved free-amount purchases independently for today and selected period, allowing losses', async () => {
      stubEmptyAggregates();
      purchaseInvoiceModel.aggregate
        .mockResolvedValueOnce([{ expenseSum: 45.25 }])
        .mockResolvedValueOnce([{ expenseSum: 80.5 }]);
      const result = await service.getDashboard({ period: SalesInvoicePeriod.MONTH, date: '2026-03-15' });
      expect(result.today.estimatedProfit).toBe(-45.25);
      expect(result.periodFinancials.estimatedGrossProfit).toBe(-80.5);
      expect(result.periodFinancials.sales).toBe(0);
      expect(result.today.collected).toBe(0);
    });
    it('defaults to month + Cairo today when period and date are omitted', async () => {
      stubEmptyAggregates();

      const result = await service.getDashboard({});

      expect(result.period.period).toBe(SalesInvoicePeriod.MONTH);
      expect(result.period.date).toBe(formatCairoDate(new Date()));
      expect(result.salesSeries.length).toBeGreaterThanOrEqual(28);
      expect(result.salesSeries.every((p) => p.sales === 0)).toBe(true);
      expect(result.topSellingItems).toEqual([]);
      expect(result.today).toEqual({
        sales: 0,
        estimatedProfit: 0,
        invoiceCount: 0,
        collected: 0,
      });
      expect(result.debt).toEqual({ totalDebt: 0, debtorCount: 0 });
    });

    it('returns gross-profit financials without an expense ledger', async () => {
      stubEmptyAggregates();
      const result = await service.getDashboard({
        period: SalesInvoicePeriod.MONTH,
        date: formatCairoDate(new Date()),
      });
      expect(result.today).toMatchObject({ estimatedProfit: 0 });
      expect(result.periodFinancials).toEqual({
        sales: 0,
        estimatedGrossProfit: 0,
      });
      expect(result.today).not.toHaveProperty('operatingExpenses');
      expect(result.today).not.toHaveProperty('estimatedNetProfit');
    });

    it('fails if period is given without date', async () => {
      const query: GetDashboardQueryDto = { period: SalesInvoicePeriod.DAY };
      await expect(service.getDashboard(query)).rejects.toThrow(BadRequestException);
    });

    it('fails if date is given without period', async () => {
      const query: GetDashboardQueryDto = { date: '2026-03-15' };
      await expect(service.getDashboard(query)).rejects.toThrow(BadRequestException);
    });

    it('fails if date is not a real calendar day', async () => {
      const query: GetDashboardQueryDto = {
        period: SalesInvoicePeriod.DAY,
        date: '2026-02-31',
      };
      await expect(service.getDashboard(query)).rejects.toThrow(BadRequestException);
    });

    it('uses custom inclusive dates for period totals and chart buckets', async () => {
      stubEmptyAggregates();
      const result = await service.getDashboard({ from: '2026-10-01', to: '2026-10-03' });
      expect(result.period.period).toBe('custom');
      expect(result.salesSeries.map((point) => point.bucketStart)).toEqual(['2026-10-01', '2026-10-02', '2026-10-03']);
      expect(formatCairoDate(new Date(result.period.to))).toBe('2026-10-04');
      await expect(service.getDashboard({ from: '2026-10-03', to: '2026-10-01' })).rejects.toThrow(BadRequestException);
    });
  });

  describe('bucket counts', () => {
    it('returns 62 daily buckets across the winter clock change', async () => {
      stubEmptyAggregates();
      const result = await service.getDashboard({ from: '2026-08-29', to: '2026-10-29' });
      expect(result.salesSeries).toHaveLength(62);
      expect(result.salesSeries[0].bucketStart).toBe('2026-08-29');
      expect(result.salesSeries[61].bucketStart).toBe('2026-10-29');
      expect(result.period.to).toBe('2026-10-29T22:00:00.000Z');
    });

    it('returns 1 bucket for day', async () => {
      stubEmptyAggregates();
      const result = await service.getDashboard({
        period: SalesInvoicePeriod.DAY,
        date: '2026-03-15',
      });
      expect(result.salesSeries).toHaveLength(1);
      expect(result.salesSeries[0].bucketStart).toBe('2026-03-15');
    });

    it('returns 7 buckets for week', async () => {
      stubEmptyAggregates();
      const result = await service.getDashboard({
        period: SalesInvoicePeriod.WEEK,
        date: '2026-03-15',
      });
      expect(result.salesSeries).toHaveLength(7);
    });

    it('returns 12 buckets for year', async () => {
      stubEmptyAggregates();
      const result = await service.getDashboard({
        period: SalesInvoicePeriod.YEAR,
        date: '2026-03-15',
      });
      expect(result.salesSeries).toHaveLength(12);
      expect(result.salesSeries[0].bucketStart).toBe('2026-01');
      expect(result.salesSeries[11].bucketStart).toBe('2026-12');
    });

    it('returns days-in-month buckets for month', async () => {
      stubEmptyAggregates();
      const result = await service.getDashboard({
        period: SalesInvoicePeriod.MONTH,
        date: '2026-02-10',
      });
      expect(result.salesSeries).toHaveLength(28);
    });
  });

  describe('today KPIs', () => {
    it('computes net sales, profit, invoice count, and collected', async () => {
      // today header
      salesInvoiceModel.aggregate
        .mockResolvedValueOnce([
          {
            totalSum: 1000,
            discountSum: 50,
            invoiceCount: 2,
          },
        ])
        // today cogs
        .mockResolvedValueOnce([{ cogsSum: 400 }])
        // top items
        .mockResolvedValueOnce([]);

      paymentModel.aggregate.mockResolvedValue([{ totalAmount: 200 }]);
      customerModel.aggregate.mockResolvedValue([{ totalDebt: 500, debtorCount: 3 }]);
      salesInvoiceModel.find.mockReturnValue(mockQuery([]));
      itemModel.find.mockReturnValue(mockQuery([]));

      const result = await service.getDashboard({
        period: SalesInvoicePeriod.DAY,
        date: '2026-03-15',
      });

      expect(result.today.sales).toBe(950);
      expect(result.today.estimatedProfit).toBe(550); // 1000 - 50 - 400
      expect(result.today.invoiceCount).toBe(2);
      expect(result.today.collected).toBe(200);
      expect(result.debt.totalDebt).toBe(500);
      expect(result.debt.debtorCount).toBe(3);
    });

    it('excludes cancelled invoices and reversed payments via $match filters', async () => {
      stubEmptyAggregates();
      await service.getDashboard({
        period: SalesInvoicePeriod.DAY,
        date: '2026-03-15',
      });

      const salesCalls = salesInvoiceModel.aggregate.mock.calls as unknown[][];
      expect(salesCalls.length).toBeGreaterThanOrEqual(2);

      const headerMatch = (salesCalls[0][0] as { $match: Record<string, unknown> }[])[0].$match;
      expect(headerMatch.status).toBe(SalesInvoiceStatus.SAVED);
      expect(headerMatch.createdAt).toEqual(
        expect.objectContaining({
          $gte: expect.any(Date),
          $lt: expect.any(Date),
        }),
      );

      const cogsMatch = (salesCalls[1][0] as { $match: Record<string, unknown> }[])[0].$match;
      expect(cogsMatch.status).toBe(SalesInvoiceStatus.SAVED);

      const paymentMatch = (paymentModel.aggregate.mock.calls[0][0] as { $match: Record<string, unknown> }[])[0].$match;
      expect(paymentMatch.reversedAt).toBeNull();
      expect(paymentMatch.createdAt).toEqual(
        expect.objectContaining({
          $gte: expect.any(Date),
          $lt: expect.any(Date),
        }),
      );
    });

    it('uses 6-dp $round for cubic volume in COGS and top-seller pipelines', async () => {
      stubEmptyAggregates();
      await service.getDashboard({
        period: SalesInvoicePeriod.DAY,
        date: '2026-03-15',
      });

      const salesCalls = salesInvoiceModel.aggregate.mock.calls as unknown[][];
      const cogsPipeline = salesCalls[1][0] as unknown[];
      const topItemsPipeline = salesCalls[2][0] as unknown[];

      expect(pipelineIncludesRound6(cogsPipeline)).toBe(true);
      expect(pipelineIncludesRound6(topItemsPipeline)).toBe(true);

      const topGroup = topItemsPipeline.find(
        (stage) => typeof stage === 'object' && stage !== null && '$group' in stage,
      ) as { $group: { _id: string } };
      expect(topGroup.$group._id).toBe('$itemId');

      const topProject = topItemsPipeline.find(
        (stage) => typeof stage === 'object' && stage !== null && '$project' in stage,
      ) as { $project: { itemId: unknown } };
      expect(topProject.$project.itemId).toEqual({ $toString: '$lines.itemId' });
      expect(JSON.stringify(topItemsPipeline)).toContain('free_amount');
      expect(JSON.stringify(cogsPipeline)).toContain('free_amount');
    });

    it('buckets period invoices into salesSeries', async () => {
      salesInvoiceModel.aggregate.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      paymentModel.aggregate.mockResolvedValue([]);
      customerModel.aggregate.mockResolvedValue([]);

      // One invoice on 2026-03-15 within day period
      const invDate = new Date('2026-03-15T12:00:00+02:00');
      salesInvoiceModel.find.mockReturnValue(
        mockQuery([
          {
            total: 300,
            discount: 20,
            get: (key: string) => (key === 'createdAt' ? invDate : undefined),
          },
        ]),
      );
      itemModel.find.mockReturnValue(mockQuery([]));

      const result = await service.getDashboard({
        period: SalesInvoicePeriod.DAY,
        date: '2026-03-15',
      });

      expect(result.salesSeries).toHaveLength(1);
      expect(result.salesSeries[0].sales).toBe(280);
    });

    it('returns top selling items with item names and no code', async () => {
      const itemId = '507f1f77bcf86cd799439011';
      salesInvoiceModel.aggregate
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            _id: { toString: () => itemId },
            revenue: 1200,
            quantity: 4,
          },
        ]);
      paymentModel.aggregate.mockResolvedValue([]);
      customerModel.aggregate.mockResolvedValue([]);
      salesInvoiceModel.find.mockReturnValue(mockQuery([]));
      itemModel.find.mockReturnValue(
        mockQuery([
          {
            _id: { toString: () => itemId },
            name: 'خشب سويد',
          },
        ]),
      );

      const result = await service.getDashboard({
        period: SalesInvoicePeriod.MONTH,
        date: '2026-03-15',
      });

      expect(result.topSellingItems).toHaveLength(1);
      expect(result.topSellingItems[0]).toEqual({
        itemId,
        name: 'خشب سويد',
        quantity: 4,
        revenue: 1200,
      });
    });

    it('returns a null name when item is missing', async () => {
      const itemId = '507f1f77bcf86cd799439011';
      salesInvoiceModel.aggregate
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            _id: { toString: () => itemId },
            revenue: 100,
            quantity: 1,
          },
        ]);
      paymentModel.aggregate.mockResolvedValue([]);
      customerModel.aggregate.mockResolvedValue([]);
      salesInvoiceModel.find.mockReturnValue(mockQuery([]));
      itemModel.find.mockReturnValue(mockQuery([]));

      const result = await service.getDashboard({
        period: SalesInvoicePeriod.MONTH,
        date: '2026-03-15',
      });

      expect(result.topSellingItems[0]).toEqual({
        itemId,
        name: null,
        quantity: 1,
        revenue: 100,
      });
    });
  });
});
