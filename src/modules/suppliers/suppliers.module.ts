import { SupplierPayment, SupplierPaymentSchema } from '../supplier-payments/schemas/supplier-payment.schema';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SuppliersService } from './suppliers.service';
import { SuppliersController } from './suppliers.controller';
import { Supplier, SupplierSchema } from './schemas/supplier.schema';
import { AuditModule } from '../audit/audit.module';

import { PurchaseInvoice, PurchaseInvoiceSchema } from '../purchases/schemas/purchase-invoice.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Supplier.name, schema: SupplierSchema },
      { name: SupplierPayment.name, schema: SupplierPaymentSchema },
      { name: PurchaseInvoice.name, schema: PurchaseInvoiceSchema },
    ]),
    AuditModule,
  ],
  controllers: [SuppliersController],
  providers: [SuppliersService],
  exports: [SuppliersService],
})
export class SuppliersModule {}
