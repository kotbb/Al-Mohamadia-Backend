import type { Types } from 'mongoose';
import type { Item } from '../../items/schemas/item.schema';
import type { StockItemCategoryDto, StockListMetaDto } from '../dto/response/stock-list-response.dto';

export type StockReadItem = Pick<
  Item,
  'name' | 'isWood' | 'pricingMode' | 'unitPrice' | 'cost' | 'stockQuantity' | 'reorderThreshold' | 'isActive'
> & {
  _id: Types.ObjectId;
  categoryId: Types.ObjectId | null;
  createdAt?: Date;
  updatedAt?: Date;
};

export interface StockCategoryCount {
  _id: Types.ObjectId;
  name: string;
  itemsCount: number;
}

export interface StockReadPage {
  items: StockReadItem[];
  categories: Map<string, StockItemCategoryDto>;
  meta: StockListMetaDto;
}
