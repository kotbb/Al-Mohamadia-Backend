export class StockAdjustmentUserDto {
  id: string;
  username: string;
}

export class StockAdjustmentItemDto {
  id: string;
  code: string;
  name: string;
}

export class StockAdjustmentResponseDto {
  id: string;
  itemId: string;
  item: StockAdjustmentItemDto | null;
  oldQuantity: number;
  newQuantity: number;
  diffQuantity: number;
  reason: string;
  adjustedBy: string;
  adjuster: StockAdjustmentUserDto | null;
  createdAt?: Date;
}

export class StockAdjustmentListMetaDto {
  page: number;
  limit: number;
  total: number;
}

export class StockAdjustmentListResponseDto {
  items: StockAdjustmentResponseDto[];
  meta: StockAdjustmentListMetaDto;
}
