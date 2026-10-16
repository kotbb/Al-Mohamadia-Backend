import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Customer, CustomerSchema } from '../customers/schemas/customer.schema';
import { Item, ItemSchema } from '../items/schemas/item.schema';
import { Payment, PaymentSchema } from '../payments/schemas/payment.schema';
import { OperatingExpense, OperatingExpenseSchema } from '../operating-expenses/schemas/operating-expense.schema';
import { SalesInvoice, SalesInvoiceSchema } from '../sales-invoices/schemas/sales-invoice.schema';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SalesInvoice.name, schema: SalesInvoiceSchema },
      { name: Payment.name, schema: PaymentSchema },
      { name: OperatingExpense.name, schema: OperatingExpenseSchema },
      { name: Customer.name, schema: CustomerSchema },
      { name: Item.name, schema: ItemSchema },
    ]),
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
