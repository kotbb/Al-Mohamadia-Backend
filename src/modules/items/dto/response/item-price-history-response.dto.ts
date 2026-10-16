export class ItemPriceHistoryResponseDto {
  id: string;
  itemId: string;
  field: string;
  oldValue: unknown;
  newValue: unknown;
  changedBy: string | null;
  createdAt?: Date;
}
