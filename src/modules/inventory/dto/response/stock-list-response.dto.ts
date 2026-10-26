import { PricingMode } from '../../../../shared/enums/pricing-mode.enum';

export class StockItemCategoryDto {
  id: string;
  name: string;
}

export class StockItemResponseDto {
  id: string;
  name: string;
  categoryId: string;
  category: StockItemCategoryDto | null;
  isWood: boolean;
  pricingMode: PricingMode;
  unitPrice: number;
  cost: number;
  stockQuantity: number;
  reorderThreshold: number;
  isActive: boolean;
  isLowStock: boolean;
  isOutOfStock: boolean;
  valuationAtCost: number;
  valuationAtSellingPrice: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export class StockListSummaryDto {
  totalItems: number;
  lowStockCount: number;
  outOfStockCount: number;
  normalStockCount: number;
}

export class StockListMetaDto {
  page: number;
  limit: number;
  total: number;
  paginationMode?: 'categories';
  totalItems?: number;
  totalPages?: number;
}

export class StockListResponseDto {
  items: StockItemResponseDto[];
  meta: StockListMetaDto;
  summary: StockListSummaryDto;
}
