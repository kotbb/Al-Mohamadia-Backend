export class CategoryValuationDto {
  categoryId: string;
  categoryName: string;
  itemsCount: number;
  valuationAtCost: number;
  valuationAtSellingPrice: number;
}

export class InventoryValuationResponseDto {
  totalItemsCount: number;
  totalValuationAtCost: number;
  totalValuationAtSellingPrice: number;
  potentialProfit: number;
  categories: CategoryValuationDto[];
}
