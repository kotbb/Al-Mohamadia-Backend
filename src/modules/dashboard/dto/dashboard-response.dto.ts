import { SalesInvoicePeriod } from '../../../shared/enums/sales-invoice-period.enum';

export class DashboardTodayDto {
  sales: number;
  estimatedProfit: number;
  invoiceCount: number;
  collected: number;
}

export class DashboardDebtDto {
  totalDebt: number;
  debtorCount: number;
}

export class DashboardPeriodDto {
  period: SalesInvoicePeriod;
  date: string;
  from: string;
  to: string;
}

export class DashboardSalesSeriesPointDto {
  bucketStart: string;
  sales: number;
}

export class DashboardTopSellingItemDto {
  itemId: string;
  name: string | null;
  code: string | null;
  quantity: number;
  revenue: number;
}

export class DashboardResponseDto {
  today: DashboardTodayDto;
  debt: DashboardDebtDto;
  period: DashboardPeriodDto;
  salesSeries: DashboardSalesSeriesPointDto[];
  topSellingItems: DashboardTopSellingItemDto[];
}
