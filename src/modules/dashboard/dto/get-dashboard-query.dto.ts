import { IsEnum, IsOptional, IsString, Matches, ValidateIf } from 'class-validator';
import { SalesInvoicePeriod } from '../../../shared/enums/sales-invoice-period.enum';

export class GetDashboardQueryDto {
  @IsOptional()
  @IsEnum(SalesInvoicePeriod)
  period?: SalesInvoicePeriod;

  @ValidateIf((o: GetDashboardQueryDto) => o.period !== undefined)
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;
}
