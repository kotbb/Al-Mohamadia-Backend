export type CustomerListFilter = {
  isDeleted: boolean;
  balance?: { $gt: number };
  isActive?: boolean;
  $or?: Array<{
    name?: { $regex: string; $options: string };
    phone?: { $regex: string; $options: string };
  }>;
};
