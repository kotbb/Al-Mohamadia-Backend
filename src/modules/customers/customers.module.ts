import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CustomersService } from './customers.service';
import { CustomersController } from './customers.controller';
import { Customer, CustomerSchema } from './schemas/customer.schema';
import { AuditModule } from '../audit/audit.module';
import { Payment, PaymentSchema } from '../sales-invoices/schemas/payment.schema';
import {
  SalesInvoice,
  SalesInvoiceSchema,
} from '../sales-invoices/schemas/sales-invoice.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Customer.name, schema: CustomerSchema },
      { name: SalesInvoice.name, schema: SalesInvoiceSchema },
      { name: Payment.name, schema: PaymentSchema },
    ]),
    AuditModule,
  ],
  controllers: [CustomersController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
