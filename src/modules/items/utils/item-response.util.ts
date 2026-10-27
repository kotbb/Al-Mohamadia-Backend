import { ItemDocument } from '../schemas/item.schema';
import { ItemResponseDto } from '../dto/response/item-response.dto';
import { normalizeDimensionDefaults } from './dimension-defaults.util';

export function toItemResponseDto(item: ItemDocument): ItemResponseDto {
  const category = item.categoryId as unknown as {
    _id: { toString: () => string };
    name: string;
    createdAt?: Date;
  };
  const originalCategoryId =
    category === null ? (item.populated('categoryId') as { toString: () => string } | undefined) : undefined;

  return {
    id: item._id.toString(),
    name: item.name,
    category: {
      id:
        typeof category === 'object' && category !== null && '_id' in category
          ? category._id.toString()
          : ((originalCategoryId ?? item.categoryId)?.toString() ?? ''),
      name: typeof category === 'object' && category !== null && 'name' in category ? category.name : '',
      createdAt: category?.createdAt,
    },
    isWood: item.isWood,
    pricingMode: item.pricingMode,
    dimensionDefaults: normalizeDimensionDefaults(item.dimensionDefaults),
    unitPrice: item.unitPrice,
    cost: item.cost,
    stockQuantity: item.stockQuantity,
    reorderThreshold: item.reorderThreshold,
    isActive: item.isActive,
    isDeleted: item.isDeleted,
    createdAt: item.get('createdAt') as Date | undefined,
    updatedAt: item.get('updatedAt') as Date | undefined,
  };
}
