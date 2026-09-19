import { PricingMode } from '../../../shared/enums/pricing-mode.enum';

export class StockItemCategoryDto {
  id: string;
  name: string;
}

export class StockItemResponseDto {
  id: string;
  code: string;
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
  isNegativeStock: boolean;
  valuationAtCost: number;
  valuationAtSellingPrice: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export class StockListSummaryDto {
  totalItems: number;
  lowStockCount: number;
  outOfStockCount: number;
  negativeStockCount: number;
  normalStockCount: number;
}

export class StockListMetaDto {
  page: number;
  limit: number;
  total: number;
}

export class StockListResponseDto {
  items: StockItemResponseDto[];
  meta: StockListMetaDto;
  summary: StockListSummaryDto;
}
