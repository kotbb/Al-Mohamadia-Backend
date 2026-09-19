import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SalesInvoicePeriod } from '../../shared/enums/sales-invoice-period.enum';
import { SalesInvoiceStatus } from '../../shared/enums/sales-invoice-status.enum';
import {
  cairoPeriodBuckets,
  cairoPeriodRange,
  formatCairoDate,
} from '../../shared/utils/period/cairo-period.util';
import { roundMoney } from '../../shared/utils/round-money/round-money.util';
import { cmToCubicMeters } from '../../shared/utils/volume/cubic-meter.util';
import { Customer, CustomerDocument } from '../customers/schemas/customer.schema';
import { Item, ItemDocument } from '../items/schemas/item.schema';
import { Payment, PaymentDocument } from '../payments/schemas/payment.schema';
import { SalesInvoice, SalesInvoiceDocument } from '../sales-invoices/schemas/sales-invoice.schema';
import { DashboardResponseDto } from './dto/dashboard-response.dto';
import { GetDashboardQueryDto } from './dto/get-dashboard-query.dto';

type TodaySalesAgg = {
  totalSum: number;
  discountSum: number;
  invoiceCount: number;
  cogsSum: number;
};

type TopItemAgg = {
  _id: string;
  revenue: number;
  quantity: number;
};

/** Matches cmToCubicMeters: round volume to 6 decimal places. */
function mongoLineVolumeM3Expr(): Record<string, unknown> {
  return {
    $round: [
      {
        $divide: [
          {
            $multiply: ['$lines.thickness', '$lines.width', '$lines.length'],
          },
          1_000_000,
        ],
      },
      6,
    ],
  };
}

function mongoLineHasDimensionsExpr(): Record<string, unknown> {
  return {
    $and: [
      { $ne: ['$lines.width', null] },
      { $ne: ['$lines.length', null] },
      { $ne: ['$lines.thickness', null] },
    ],
  };
}

@Injectable()
export class DashboardService {
  constructor(
    @InjectModel(SalesInvoice.name)
    private readonly salesInvoiceModel: Model<SalesInvoiceDocument>,
    @InjectModel(Payment.name)
    private readonly paymentModel: Model<PaymentDocument>,
    @InjectModel(Customer.name)
    private readonly customerModel: Model<CustomerDocument>,
    @InjectModel(Item.name)
    private readonly itemModel: Model<ItemDocument>,
  ) {}

  public async getDashboard(query: GetDashboardQueryDto): Promise<DashboardResponseDto> {
    const { period, date } = this.resolvePeriodQuery(query);
    const periodRange = cairoPeriodRange(period, date);
    const buckets = cairoPeriodBuckets(period, date);

    const todayIso = formatCairoDate(new Date());
    const todayRange = cairoPeriodRange(SalesInvoicePeriod.DAY, todayIso);

    const [todaySalesAgg, collectedAgg, debtAgg, periodInvoices, topItemsAgg] = await Promise.all([
      this.aggregateTodaySales(todayRange.from, todayRange.to),
      this.aggregateCollected(todayRange.from, todayRange.to),
      this.aggregateDebt(),
      this.fetchPeriodSavedInvoices(periodRange.from, periodRange.to),
      this.aggregateTopSellingItems(periodRange.from, periodRange.to),
    ]);

    const sales = roundMoney(todaySalesAgg.totalSum - todaySalesAgg.discountSum);
    const estimatedProfit = roundMoney(todaySalesAgg.totalSum - todaySalesAgg.discountSum - todaySalesAgg.cogsSum);

    const salesSeries = buckets.map((bucket) => {
      let bucketSales = 0;
      for (const inv of periodInvoices) {
        const createdAt = inv.get('createdAt') as Date | undefined;
        if (!createdAt) {
          continue;
        }
        const t = createdAt.getTime();
        if (t >= bucket.from.getTime() && t < bucket.to.getTime()) {
          bucketSales += inv.total - inv.discount;
        }
      }
      return {
        bucketStart: bucket.bucketStart,
        sales: roundMoney(bucketSales),
      };
    });

    const itemIds = topItemsAgg.map((row) => row._id.toString());
    const items =
      itemIds.length > 0
        ? await this.itemModel
            .find({ _id: { $in: itemIds } })
            .select('name code')
            .exec()
        : [];
    const itemMap = new Map(items.map((item) => [item._id.toString(), item]));

    const topSellingItems = topItemsAgg.map((row) => {
      const id = row._id.toString();
      const item = itemMap.get(id);
      return {
        itemId: id,
        name: item?.name ?? null,
        code: item?.code ?? null,
        quantity: roundMoney(row.quantity),
        revenue: roundMoney(row.revenue),
      };
    });

    return {
      today: {
        sales,
        estimatedProfit,
        invoiceCount: todaySalesAgg.invoiceCount,
        collected: roundMoney(collectedAgg),
      },
      debt: {
        totalDebt: roundMoney(debtAgg.totalDebt),
        debtorCount: debtAgg.debtorCount,
      },
      period: {
        period,
        date,
        from: periodRange.from.toISOString(),
        to: periodRange.to.toISOString(),
      },
      salesSeries,
      topSellingItems,
    };
  }

  // ------------------- Helper Functions -------------------
  private resolvePeriodQuery(query: GetDashboardQueryDto): {
    period: SalesInvoicePeriod;
    date: string;
  } {
    const hasPeriod = query.period !== undefined;
    const hasDate = Boolean(query.date);

    if (hasPeriod && !hasDate) {
      throw new BadRequestException('date is required when period is set');
    }
    if (hasDate && !hasPeriod) {
      throw new BadRequestException('period is required when date is set');
    }

    if (!hasPeriod && !hasDate) {
      return {
        period: SalesInvoicePeriod.MONTH,
        date: formatCairoDate(new Date()),
      };
    }

    try {
      cairoPeriodRange(query.period!, query.date!);
    } catch {
      throw new BadRequestException('Invalid date for period filter');
    }

    return {
      period: query.period!,
      date: query.date!,
    };
  }

  private async aggregateTodaySales(from: Date, to: Date): Promise<TodaySalesAgg> {
    const invoiceFilter = {
      status: SalesInvoiceStatus.SAVED,
      createdAt: { $gte: from, $lt: to },
    };

    const [headerAgg, cogsAgg] = await Promise.all([
      this.salesInvoiceModel.aggregate<{
        totalSum: number;
        discountSum: number;
        invoiceCount: number;
      }>([
        { $match: invoiceFilter },
        {
          $group: {
            _id: null,
            totalSum: { $sum: '$total' },
            discountSum: { $sum: '$discount' },
            invoiceCount: { $sum: 1 },
          },
        },
      ]),
      this.salesInvoiceModel.aggregate<{ cogsSum: number }>([
        { $match: invoiceFilter },
        { $unwind: '$lines' },
        {
          $project: {
            lineCogs: {
              $cond: [
                mongoLineHasDimensionsExpr(),
                {
                  $multiply: ['$lines.quantity', mongoLineVolumeM3Expr(), '$lines.costPriceSnapshot'],
                },
                {
                  $multiply: ['$lines.quantity', '$lines.costPriceSnapshot'],
                },
              ],
            },
          },
        },
        {
          $group: {
            _id: null,
            cogsSum: { $sum: '$lineCogs' },
          },
        },
      ]),
    ]);

    return {
      totalSum: headerAgg[0]?.totalSum ?? 0,
      discountSum: headerAgg[0]?.discountSum ?? 0,
      invoiceCount: headerAgg[0]?.invoiceCount ?? 0,
      cogsSum: cogsAgg[0]?.cogsSum ?? 0,
    };
  }

  private async aggregateCollected(from: Date, to: Date): Promise<number> {
    const agg = await this.paymentModel.aggregate<{ totalAmount: number }>([
      {
        $match: {
          reversedAt: null,
          createdAt: { $gte: from, $lt: to },
        },
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$amount' },
        },
      },
    ]);
    return agg[0]?.totalAmount ?? 0;
  }

  private async aggregateDebt(): Promise<{ totalDebt: number; debtorCount: number }> {
    const agg = await this.customerModel.aggregate<{
      totalDebt: number;
      debtorCount: number;
    }>([
      { $match: { isDeleted: false } },
      {
        $group: {
          _id: null,
          totalDebt: { $sum: '$balance' },
          debtorCount: {
            $sum: {
              $cond: [{ $gt: ['$balance', 0] }, 1, 0],
            },
          },
        },
      },
    ]);

    return {
      totalDebt: agg[0]?.totalDebt ?? 0,
      debtorCount: agg[0]?.debtorCount ?? 0,
    };
  }

  private async fetchPeriodSavedInvoices(from: Date, to: Date): Promise<SalesInvoiceDocument[]> {
    return this.salesInvoiceModel
      .find({
        status: SalesInvoiceStatus.SAVED,
        createdAt: { $gte: from, $lt: to },
      })
      .select('total discount createdAt')
      .exec();
  }

  private async aggregateTopSellingItems(from: Date, to: Date): Promise<TopItemAgg[]> {
    return this.salesInvoiceModel.aggregate<TopItemAgg>([
      {
        $match: {
          status: SalesInvoiceStatus.SAVED,
          createdAt: { $gte: from, $lt: to },
        },
      },
      { $unwind: '$lines' },
      {
        $project: {
          itemId: { $toString: '$lines.itemId' },
          revenue: '$lines.lineTotal',
          quantity: {
            $cond: [
              mongoLineHasDimensionsExpr(),
              // Matches stockDeltaForLine: round(qty × volume, 6)
              {
                $round: [{ $multiply: ['$lines.quantity', mongoLineVolumeM3Expr()] }, 6],
              },
              '$lines.quantity',
            ],
          },
        },
      },
      {
        $group: {
          _id: '$itemId',
          revenue: { $sum: '$revenue' },
          quantity: { $sum: '$quantity' },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: 5 },
    ]);
  }
}

/** Exposed for unit tests that assert line COGS without Mongo. */
export function lineCogsFromFields(params: {
  quantity: number;
  costPriceSnapshot: number;
  width: number | null;
  length: number | null;
  thickness: number | null;
}): number {
  if (params.width != null && params.length != null && params.thickness != null) {
    const volume = cmToCubicMeters(params.thickness, params.width, params.length);
    return params.quantity * volume * params.costPriceSnapshot;
  }
  return params.quantity * params.costPriceSnapshot;
}
