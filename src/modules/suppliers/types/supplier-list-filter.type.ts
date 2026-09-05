export type SupplierListFilter = {
  isDeleted: boolean;
  amountOwed?: { $gt: number };
  isActive?: boolean;
  $or?: Array<{
    name?: { $regex: string; $options: string };
    phone?: { $regex: string; $options: string };
  }>;
};
