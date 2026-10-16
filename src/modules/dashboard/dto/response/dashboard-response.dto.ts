import { SalesInvoicePeriod } from '../../../../shared/enums/sales-invoice-period.enum';

export class DashboardTodayDto {
  sales: number;
  estimatedProfit: number;
  operatingExpenses: number;
  estimatedNetProfit: number;
  invoiceCount: number;
  collected: number;
}

export class DashboardPeriodFinancialsDto {
  sales: number;
  estimatedGrossProfit: number;
  operatingExpenses: number;
  estimatedNetProfit: number;
}

export class DashboardDebtDto {
  totalDebt: number;
  debtorCount: number;
}

export class DashboardPeriodDto {
  period: SalesInvoicePeriod | 'custom';
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
  periodFinancials: DashboardPeriodFinancialsDto;
  debt: DashboardDebtDto;
  period: DashboardPeriodDto;
  salesSeries: DashboardSalesSeriesPointDto[];
  topSellingItems: DashboardTopSellingItemDto[];
}
