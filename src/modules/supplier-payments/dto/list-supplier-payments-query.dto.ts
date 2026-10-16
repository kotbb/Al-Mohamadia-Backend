import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsMongoId, IsOptional, IsString, Matches, Max, Min, ValidateIf } from 'class-validator';
import { PaymentMethod } from '../../../shared/enums/payment-method.enum';
import { SalesInvoicePeriod } from '../../../shared/enums/sales-invoice-period.enum';
import { PaymentStatusFilter } from '../../payments/enums/payment-status-filter.enum';
import { PaymentTypeFilter } from '../../payments/enums/payment-type-filter.enum';

export class ListSupplierPaymentsQueryDto {
  @IsOptional()
  @IsMongoId()
  supplierId?: string;

  @IsOptional()
  @IsMongoId()
  purchaseInvoiceId?: string;

  @IsOptional()
  @IsEnum(PaymentStatusFilter)
  status?: PaymentStatusFilter = PaymentStatusFilter.ACTIVE;

  @IsOptional()
  @IsEnum(PaymentTypeFilter)
  type?: PaymentTypeFilter = PaymentTypeFilter.ALL;

  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @IsOptional()
  @IsEnum(SalesInvoicePeriod)
  period?: SalesInvoicePeriod;

  @ValidateIf((o: ListSupplierPaymentsQueryDto) => o.period !== undefined)
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
