import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../shared/auth/decorators/current-user.decorator';
import { Roles } from '../../shared/auth/decorators/roles.decorator';
import { UserRole } from '../../shared/auth/enums/user-role.enum';
import type { AuthUser } from '../../shared/auth/interfaces/auth-user.interface';
import { ParseObjectIdPipe } from '../../shared/pipes/parse-object-id/parse-object-id.pipe';
import { ListSupplierPaymentsQueryDto } from './dto/list-supplier-payments-query.dto';
import {
  SupplierPaymentListResponseDto,
  SupplierPaymentResponseDto,
} from './dto/supplier-payment-response.dto';
import { RecordSupplierPaymentDto } from './dto/record-supplier-payment.dto';
import { SupplierPaymentsService } from './supplier-payments.service';

@Controller('supplier-payments')
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class SupplierPaymentsController {
  constructor(private readonly supplierPaymentsService: SupplierPaymentsService) {}

  // POST /supplier-payments
  @Post()
  public record(
    @Body() dto: RecordSupplierPaymentDto,
    @CurrentUser() user: AuthUser,
  ): Promise<SupplierPaymentResponseDto> {
    return this.supplierPaymentsService.recordPayment(dto, user);
  }

  // GET /supplier-payments
  @Get()
  public findAll(@Query() query: ListSupplierPaymentsQueryDto): Promise<SupplierPaymentListResponseDto> {
    return this.supplierPaymentsService.findAll(query);
  }

  // GET /supplier-payments/:id
  @Get(':id')
  public findOne(@Param('id', ParseObjectIdPipe) id: string): Promise<SupplierPaymentResponseDto> {
    return this.supplierPaymentsService.findOne(id);
  }

  // POST /supplier-payments/:id/cancel
  @Post(':id/cancel')
  public cancel(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<SupplierPaymentResponseDto> {
    return this.supplierPaymentsService.cancelPayment(id, user);
  }
}
