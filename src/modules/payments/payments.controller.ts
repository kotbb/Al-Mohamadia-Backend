import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../shared/auth/decorators/current-user.decorator';
import { Roles } from '../../shared/auth/decorators/roles.decorator';
import { UserRole } from '../../shared/auth/enums/user-role.enum';
import type { AuthUser } from '../../shared/auth/interfaces/auth-user.interface';
import { ParseObjectIdPipe } from '../../shared/pipes/parse-object-id/parse-object-id.pipe';
import { ListPaymentsQueryDto } from './dto/request/list-payments-query.dto';
import { PaymentListResponseDto, PaymentResponseDto } from './dto/response/payment-response.dto';
import { RecordPaymentDto } from './dto/request/record-payment.dto';
import { PaymentsService } from './payments.service';

@Controller('payments')
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  // POST /payments
  @Post()
  public record(@Body() dto: RecordPaymentDto, @CurrentUser() user: AuthUser): Promise<PaymentResponseDto> {
    return this.paymentsService.recordPayment(dto, user);
  }

  // GET /payments
  @Get()
  public findAll(@Query() query: ListPaymentsQueryDto): Promise<PaymentListResponseDto> {
    return this.paymentsService.findAll(query);
  }

  // GET /payments/:id
  @Get(':id')
  public findOne(@Param('id', ParseObjectIdPipe) id: string): Promise<PaymentResponseDto> {
    return this.paymentsService.findOne(id);
  }

  // POST /payments/:id/cancel
  @Post(':id/cancel')
  public cancel(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<PaymentResponseDto> {
    return this.paymentsService.cancelPayment(id, user);
  }
}
