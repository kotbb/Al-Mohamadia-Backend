import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsMongoId, IsOptional, IsString, Matches, Max, Min, ValidateIf } from 'class-validator';
import { PurchaseInvoiceStatus } from '../../../shared/enums/purchase-invoice-status.enum';
import { SalesInvoicePeriod } from '../../../shared/enums/sales-invoice-period.enum';

export class ListPurchaseInvoicesQueryDto {
  @IsOptional()
  @IsMongoId()
  supplierId?: string;

  @IsOptional()
  @IsEnum(PurchaseInvoiceStatus)
  status?: PurchaseInvoiceStatus;

  @IsOptional()
  @IsEnum(SalesInvoicePeriod)
  period?: SalesInvoicePeriod;

  @ValidateIf((o: ListPurchaseInvoicesQueryDto) => o.period !== undefined)
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;

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
  limit?: number = 20;
}
