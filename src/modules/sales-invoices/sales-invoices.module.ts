import { Category, CategorySchema } from '../categories/schemas/category.schema';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditModule } from '../audit/audit.module';
import { Customer, CustomerSchema } from '../customers/schemas/customer.schema';
import { Item, ItemSchema } from '../items/schemas/item.schema';
import { SalesInvoicesController } from './sales-invoices.controller';
import { PublicSalesInvoicesController } from './public-sales-invoices.controller';
import { SalesInvoicesService } from './sales-invoices.service';
import { InvoiceCounter, InvoiceCounterSchema } from './schemas/invoice-counter.schema';
import { Payment, PaymentSchema } from '../payments/schemas/payment.schema';
import { SalesInvoice, SalesInvoiceSchema } from './schemas/sales-invoice.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Category.name, schema: CategorySchema },
      { name: SalesInvoice.name, schema: SalesInvoiceSchema },
      { name: Payment.name, schema: PaymentSchema },
      { name: InvoiceCounter.name, schema: InvoiceCounterSchema },
      { name: Customer.name, schema: CustomerSchema },
      { name: Item.name, schema: ItemSchema },
    ]),
    AuditModule,
  ],
  controllers: [SalesInvoicesController, PublicSalesInvoicesController],
  providers: [SalesInvoicesService],
  exports: [SalesInvoicesService, MongooseModule],
})
export class SalesInvoicesModule {}
