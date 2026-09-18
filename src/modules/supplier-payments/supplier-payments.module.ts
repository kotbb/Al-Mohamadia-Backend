import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditModule } from '../audit/audit.module';
import { Supplier, SupplierSchema } from '../suppliers/schemas/supplier.schema';
import { SupplierPayment, SupplierPaymentSchema } from './schemas/supplier-payment.schema';
import { SupplierPaymentsController } from './supplier-payments.controller';
import { SupplierPaymentsService } from './supplier-payments.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SupplierPayment.name, schema: SupplierPaymentSchema },
      { name: Supplier.name, schema: SupplierSchema },
    ]),
    AuditModule,
  ],
  controllers: [SupplierPaymentsController],
  providers: [SupplierPaymentsService],
  exports: [SupplierPaymentsService, MongooseModule],
})
export class SupplierPaymentsModule {}
