import { PricingMode } from '../../../shared/enums/pricing-mode.enum';

export class ItemCategorySummaryDto {
  id: string;
  name: string;
}

export class ItemResponseDto {
  id: string;
  code: string;
  name: string;
  category: ItemCategorySummaryDto;
  isWood: boolean;
  pricingMode: PricingMode;
  unitPrice: number;
  cost: number;
  stockQuantity: number;
  reorderThreshold: number;
  isActive: boolean;
  isDeleted: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}
