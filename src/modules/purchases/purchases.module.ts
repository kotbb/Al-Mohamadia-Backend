import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditModule } from '../audit/audit.module';
import { Item, ItemSchema } from '../items/schemas/item.schema';
import { InvoiceCounter, InvoiceCounterSchema } from '../sales-invoices/schemas/invoice-counter.schema';
import { Supplier, SupplierSchema } from '../suppliers/schemas/supplier.schema';
import { SupplierPayment, SupplierPaymentSchema } from '../supplier-payments/schemas/supplier-payment.schema';
import { PurchasesController } from './purchases.controller';
import { PurchasesService } from './purchases.service';
import { PurchaseInvoice, PurchaseInvoiceSchema } from './schemas/purchase-invoice.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PurchaseInvoice.name, schema: PurchaseInvoiceSchema },
      { name: InvoiceCounter.name, schema: InvoiceCounterSchema },
      { name: Supplier.name, schema: SupplierSchema },
      { name: Item.name, schema: ItemSchema },
      { name: SupplierPayment.name, schema: SupplierPaymentSchema },
    ]),
    AuditModule,
  ],
  controllers: [PurchasesController],
  providers: [PurchasesService],
  exports: [PurchasesService, MongooseModule],
})
export class PurchasesModule {}
