import { PricingMode } from '../../../../shared/enums/pricing-mode.enum';
import type { DimensionDefaults } from '../../types/dimension-defaults.types';

export class ItemCategorySummaryDto {
  id: string;
  name: string;
  createdAt?: Date;
}

export class ItemResponseDto {
  id: string;
  name: string;
  category: ItemCategorySummaryDto;
  isWood: boolean;
  pricingMode: PricingMode;
  dimensionDefaults: DimensionDefaults;
  unitPrice: number;
  cost: number;
  stockQuantity: number;
  reorderThreshold: number;
  isActive: boolean;
  isDeleted: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}
