import type {
  TodaySalesAgg,
  TopItemAgg,
  SalesHeaderAgg,
  SalesCogsAgg,
  CollectedAgg,
  DebtAgg,
  PurchaseExpenseAgg,
} from './types/dashboard-aggregation.types';
import {
  buildSalesHeaderPipeline,
  buildSalesCogsPipeline,
  buildCollectedPipeline,
  buildDebtPipeline,
  buildTopSellingItemsPipeline,
  buildFreeAmountPurchaseExpensePipeline,
} from './utils/dashboard-aggregation.util';
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SalesInvoicePeriod } from '../../shared/enums/sales-invoice-period.enum';
import { SalesInvoiceStatus } from '../../shared/enums/sales-invoice-status.enum';
import {
  cairoCustomRange,
  cairoPeriodBuckets,
  cairoPeriodRange,
  formatCairoDate,
} from '../../shared/utils/period/cairo-period.util';
import { roundMoney } from '../../shared/utils/round-money/round-money.util';
import { Customer, CustomerDocument } from '../customers/schemas/customer.schema';
import { Item, ItemDocument } from '../items/schemas/item.schema';
import { Payment, PaymentDocument } from '../payments/schemas/payment.schema';
import { SalesInvoice, SalesInvoiceDocument } from '../sales-invoices/schemas/sales-invoice.schema';
import { DashboardResponseDto } from './dto/response/dashboard-response.dto';
import { GetDashboardQueryDto } from './dto/request/get-dashboard-query.dto';
import { dashboardCustomBuckets } from './utils/dashboard-custom-buckets.util';
import { PurchaseInvoice, PurchaseInvoiceDocument } from '../purchases/schemas/purchase-invoice.schema';

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
    @InjectModel(PurchaseInvoice.name)
    private readonly purchaseInvoiceModel: Model<PurchaseInvoiceDocument>,
  ) {}

  public async getDashboard(query: GetDashboardQueryDto): Promise<DashboardResponseDto> {
    const { period, date } = this.resolvePeriodQuery(query);
    const periodRange = period === 'custom' ? cairoCustomRange(query.from, query.to) : cairoPeriodRange(period, date);
    const buckets =
      period === 'custom' ? dashboardCustomBuckets(query.from!, query.to!) : cairoPeriodBuckets(period, date);

    const todayIso = formatCairoDate(new Date());
    const todayRange = cairoPeriodRange(SalesInvoicePeriod.DAY, todayIso);

    const [
      todaySalesAgg,
      collectedAgg,
      debtAgg,
      periodInvoices,
      topItemsAgg,
      periodSalesAgg,
      todayExpenses,
      periodExpenses,
    ] = await Promise.all([
      this.aggregateTodaySales(todayRange.from, todayRange.to),
      this.aggregateCollected(todayRange.from, todayRange.to),
      this.aggregateDebt(),
      this.fetchPeriodSavedInvoices(periodRange.from, periodRange.to),
      this.aggregateTopSellingItems(periodRange.from, periodRange.to),
      this.aggregateTodaySales(periodRange.from, periodRange.to),
      this.aggregatePurchaseExpenses(todayRange.from, todayRange.to),
      this.aggregatePurchaseExpenses(periodRange.from, periodRange.to),
    ]);

    const sales = roundMoney(todaySalesAgg.totalSum - todaySalesAgg.discountSum);
    const estimatedProfit = roundMoney(
      todaySalesAgg.totalSum - todaySalesAgg.discountSum - todaySalesAgg.cogsSum - todayExpenses,
    );
    const periodGrossProfit = roundMoney(
      periodSalesAgg.totalSum - periodSalesAgg.discountSum - periodSalesAgg.cogsSum - periodExpenses,
    );

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
            .select('name')
            .exec()
        : [];
    const itemMap = new Map(items.map((item) => [item._id.toString(), item]));

    const topSellingItems = topItemsAgg.map((row) => {
      const id = row._id.toString();
      const item = itemMap.get(id);
      return {
        itemId: id,
        name: item?.name ?? null,
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
      periodFinancials: {
        sales: roundMoney(periodSalesAgg.totalSum - periodSalesAgg.discountSum),
        estimatedGrossProfit: periodGrossProfit,
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
    period: SalesInvoicePeriod | 'custom';
    date: string;
  } {
    const hasPeriod = query.period !== undefined;
    const hasDate = Boolean(query.date);

    if (query.from || query.to) {
      if (hasPeriod || hasDate) throw new BadRequestException('Choose a period or a custom range');
      try {
        cairoCustomRange(query.from, query.to);
        dashboardCustomBuckets(query.from!, query.to!);
      } catch {
        throw new BadRequestException('Invalid custom date range');
      }
      return { period: 'custom', date: query.from! };
    }

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
    const [headerAgg, cogsAgg] = await Promise.all([
      this.salesInvoiceModel.aggregate<SalesHeaderAgg>(buildSalesHeaderPipeline(from, to)),
      this.salesInvoiceModel.aggregate<SalesCogsAgg>(buildSalesCogsPipeline(from, to)),
    ]);

    return {
      totalSum: headerAgg[0]?.totalSum ?? 0,
      discountSum: headerAgg[0]?.discountSum ?? 0,
      invoiceCount: headerAgg[0]?.invoiceCount ?? 0,
      cogsSum: cogsAgg[0]?.cogsSum ?? 0,
    };
  }

  private async aggregateCollected(from: Date, to: Date): Promise<number> {
    const agg = await this.paymentModel.aggregate<CollectedAgg>(buildCollectedPipeline(from, to));
    return agg[0]?.totalAmount ?? 0;
  }

  private async aggregatePurchaseExpenses(from: Date, to: Date): Promise<number> {
    const agg = await this.purchaseInvoiceModel.aggregate<PurchaseExpenseAgg>(
      buildFreeAmountPurchaseExpensePipeline(from, to),
    );
    return agg[0]?.expenseSum ?? 0;
  }

  private async aggregateDebt(): Promise<DebtAgg> {
    const agg = await this.customerModel.aggregate<DebtAgg>(buildDebtPipeline());

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
    return this.salesInvoiceModel.aggregate<TopItemAgg>(buildTopSellingItemsPipeline(from, to));
  }
}
