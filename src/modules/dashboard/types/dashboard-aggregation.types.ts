export type TodaySalesAgg = {
  totalSum: number;
  discountSum: number;
  invoiceCount: number;
  cogsSum: number;
};

export type TopItemAgg = {
  _id: string;
  revenue: number;
  quantity: number;
};

export type SalesHeaderAgg = Omit<TodaySalesAgg, 'cogsSum'>;
export type SalesCogsAgg = Pick<TodaySalesAgg, 'cogsSum'>;
export interface CollectedAgg {
  totalAmount: number;
}
export interface PurchaseExpenseAgg {
  expenseSum: number;
}
export interface DebtAgg {
  totalDebt: number;
  debtorCount: number;
}
