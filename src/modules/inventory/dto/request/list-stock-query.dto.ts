import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsMongoId, IsOptional, IsString, Max, Min } from 'class-validator';
import { StockStatusFilter } from '../../enums/stock-status-filter.enum';

export class ListStockQueryDto {
  @IsOptional()
  @IsIn(['items', 'categories'])
  paginationMode?: 'items' | 'categories' = 'items';

  @IsOptional()
  @IsMongoId()
  categoryId?: string;

  @IsOptional()
  @IsEnum(StockStatusFilter)
  stockStatus?: StockStatusFilter = StockStatusFilter.ALL;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
