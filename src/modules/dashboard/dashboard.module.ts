import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Customer, CustomerSchema } from '../customers/schemas/customer.schema';
import { Item, ItemSchema } from '../items/schemas/item.schema';
import { Payment, PaymentSchema } from '../payments/schemas/payment.schema';
import { SalesInvoice, SalesInvoiceSchema } from '../sales-invoices/schemas/sales-invoice.schema';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { PurchaseInvoice, PurchaseInvoiceSchema } from '../purchases/schemas/purchase-invoice.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SalesInvoice.name, schema: SalesInvoiceSchema },
      { name: Payment.name, schema: PaymentSchema },
      { name: Customer.name, schema: CustomerSchema },
      { name: Item.name, schema: ItemSchema },
      { name: PurchaseInvoice.name, schema: PurchaseInvoiceSchema },
    ]),
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
