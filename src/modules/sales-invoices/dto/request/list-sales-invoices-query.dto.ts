import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Matches, Max, Min, ValidateIf } from 'class-validator';
import { SalesInvoicePeriod } from '../../../../shared/enums/sales-invoice-period.enum';
import { SalesInvoiceStatus } from '../../../../shared/enums/sales-invoice-status.enum';

export class ListSalesInvoicesQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsEnum(SalesInvoiceStatus)
  status?: SalesInvoiceStatus;

  @IsOptional()
  @IsEnum(SalesInvoicePeriod)
  period?: SalesInvoicePeriod;

  @ValidateIf((o: ListSalesInvoicesQueryDto) => o.period !== undefined)
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;

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
  limit?: number = 10;
}
