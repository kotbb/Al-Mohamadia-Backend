export type CustomerListFilter = {
  isDeleted: boolean;
  balance?: { $gt: number };
  isActive?: boolean;
  name?: { $regex: string; $options: string };
};
