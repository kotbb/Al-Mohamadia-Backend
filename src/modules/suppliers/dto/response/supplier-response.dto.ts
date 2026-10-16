export class SupplierResponseDto {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  amountOwed: number;
  isActive: boolean;
  isDeleted: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export class SupplierListMetaDto {
  page: number;
  limit: number;
  total: number;
}

export class SupplierListSummaryDto {
  totalOwed: number;
}

export class SupplierListResponseDto {
  items: SupplierResponseDto[];
  meta: SupplierListMetaDto;
  summary: SupplierListSummaryDto;
}
