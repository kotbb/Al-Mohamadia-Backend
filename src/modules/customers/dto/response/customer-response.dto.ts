export class CustomerResponseDto {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  balance: number;
  isActive: boolean;
  isDeleted: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export class CustomerListMetaDto {
  page: number;
  limit: number;
  total: number;
}

export class CustomerListSummaryDto {
  totalDebt: number;
}

export class CustomerListResponseDto {
  items: CustomerResponseDto[];
  meta: CustomerListMetaDto;
  summary: CustomerListSummaryDto;
}
