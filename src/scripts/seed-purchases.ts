import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AppModule } from '../app.module';
import { Item, ItemDocument } from '../modules/items/schemas/item.schema';
import { PurchaseInvoice, PurchaseInvoiceDocument } from '../modules/purchases/schemas/purchase-invoice.schema';
import { SupplierPayment, SupplierPaymentDocument } from '../modules/supplier-payments/schemas/supplier-payment.schema';
import { Supplier, SupplierDocument } from '../modules/suppliers/schemas/supplier.schema';
import { User, UserDocument } from '../modules/users/schemas/user.schema';
import { PaymentMethod } from '../shared/enums/payment-method.enum';
import { PricingMode } from '../shared/enums/pricing-mode.enum';
import { PurchaseInvoiceStatus } from '../shared/enums/purchase-invoice-status.enum';
import { roundMoney } from '../shared/utils/round-money/round-money.util';
import { lineTotalForPricing, stockDeltaForLine } from '../shared/utils/volume/cubic-meter.util';

async function seedPurchases() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const purchaseInvoiceModel = app.get<Model<PurchaseInvoiceDocument>>(getModelToken(PurchaseInvoice.name));
    const supplierPaymentModel = app.get<Model<SupplierPaymentDocument>>(getModelToken(SupplierPayment.name));
    const itemModel = app.get<Model<ItemDocument>>(getModelToken(Item.name));
    const supplierModel = app.get<Model<SupplierDocument>>(getModelToken(Supplier.name));
    const userModel = app.get<Model<UserDocument>>(getModelToken(User.name));

    const invoiceNumber = 'PUR-9001';
    const existingPurchase = await purchaseInvoiceModel.findOne({ invoiceNumber }).exec();

    let supplier = await supplierModel.findOne({ isDeleted: false, isActive: true }).exec();
    if (!supplier) {
      supplier = await supplierModel.create({
        name: 'مؤسسة الخشب الحديث',
        phone: '0223456789',
        address: 'القاهرة، شبرا الخيمة',
        amountOwed: 8500,
        isActive: true,
        isDeleted: false,
      });
      console.log(`Created supplier: ${supplier.name}`);
    }

    const user = await userModel.findOne({ isDeleted: false }).exec();
    if (!user) {
      throw new Error('No user found in database. Please ensure at least one admin user exists.');
    }

    let pieceItem = await itemModel
      .findOne({ pricingMode: PricingMode.PER_PIECE, isDeleted: false, isActive: true })
      .exec();
    if (!pieceItem) {
      pieceItem = await itemModel.create({
        code: 'MDF-18',
        name: 'لوح MDF 18mm',
        categoryId: new Types.ObjectId(),
        isWood: false,
        pricingMode: PricingMode.PER_PIECE,
        unitPrice: 450,
        cost: 380,
        stockQuantity: 48,
        reorderThreshold: 10,
        isActive: true,
        isDeleted: false,
      });
      console.log(`Created piece item: ${pieceItem.name}`);
    }

    let cubicItem = await itemModel
      .findOne({ pricingMode: PricingMode.PER_CUBIC_METER, isDeleted: false, isActive: true })
      .exec();
    if (!cubicItem) {
      cubicItem = await itemModel.create({
        code: 'WOOD-BALADI',
        name: 'خشب بلدي',
        categoryId: pieceItem.categoryId,
        isWood: true,
        pricingMode: PricingMode.PER_CUBIC_METER,
        unitPrice: 8500,
        cost: 7200,
        stockQuantity: 12.5,
        reorderThreshold: 3,
        isActive: true,
        isDeleted: false,
      });
      console.log(`Created cubic item: ${cubicItem.name}`);
    }

    let purchaseDoc = existingPurchase;

    if (!existingPurchase) {
      // 1. Line 1: Piece item (10 pieces of MDF-18 @ 350 unitCost = 3500)
      const pieceLineCost = 350;
      const pieceQuantity = 10;
      const pieceTotal = roundMoney(
        lineTotalForPricing({
          pricingMode: PricingMode.PER_PIECE,
          quantity: pieceQuantity,
          piecePrice: pieceLineCost,
        }),
      );
      const pieceStockDelta = stockDeltaForLine({
        pricingMode: PricingMode.PER_PIECE,
        quantity: pieceQuantity,
      });

      // 2. Line 2: Cubic wood item (5 pieces of 5cm x 10cm x 400cm = 0.1 m³ each, total 0.5 m³ @ 8000 = 4000)
      const cubicQuantity = 5;
      const cubicUnitCost = 8000;
      const thickness = 5;
      const width = 10;
      const length = 400;

      const cubicTotal = roundMoney(
        lineTotalForPricing({
          pricingMode: PricingMode.PER_CUBIC_METER,
          quantity: cubicQuantity,
          piecePrice: cubicUnitCost,
          thicknessCm: thickness,
          widthCm: width,
          lengthCm: length,
        }),
      );
      const cubicStockDelta = stockDeltaForLine({
        pricingMode: PricingMode.PER_CUBIC_METER,
        quantity: cubicQuantity,
        thicknessCm: thickness,
        widthCm: width,
        lengthCm: length,
      });

      const total = roundMoney(pieceTotal + cubicTotal); // 3500 + 4000 = 7500
      const paid = 3000; // paid upfront
      const remaining = roundMoney(total - paid); // 4500 remaining

      const [created] = await purchaseInvoiceModel.create([
        {
          invoiceNumber,
          supplierId: supplier._id,
          lines: [
            {
              itemId: pieceItem._id,
              quantity: pieceQuantity,
              width: null,
              length: null,
              thickness: null,
              unitCost: pieceLineCost,
              lineTotal: pieceTotal,
              note: 'توريد دفعة أولى ألواح MDF',
            },
            {
              itemId: cubicItem._id,
              quantity: cubicQuantity,
              width,
              length,
              thickness,
              unitCost: cubicUnitCost,
              lineTotal: cubicTotal,
              note: 'خشب بلدي قطاع 5x10x400',
            },
          ],
          total,
          paid,
          remaining,
          status: PurchaseInvoiceStatus.SAVED,
          notes: 'فاتورة توريد خشب وألواح أول العام',
          createdBy: user._id,
        },
      ]);

      purchaseDoc = created;

      // Update item stock
      await itemModel.updateOne({ _id: pieceItem._id }, { $inc: { stockQuantity: pieceStockDelta } });
      await itemModel.updateOne({ _id: cubicItem._id }, { $inc: { stockQuantity: cubicStockDelta } });

      // Update supplier debt (+4500 remaining)
      supplier.amountOwed = roundMoney(supplier.amountOwed + remaining);
      await supplier.save();

      // Record on-purchase upfront payment
      await supplierPaymentModel.create({
        supplierId: supplier._id,
        purchaseInvoiceId: created._id,
        amount: paid,
        method: PaymentMethod.BANK_TRANSFER,
        notes: 'دفعة مقدمة تحويل بنكي على فاتورة PUR-9001',
        recordedBy: user._id,
        reversedAt: null,
        reversedBy: null,
      });

      console.log(
        `Created purchase invoice ${invoiceNumber} for supplier ${supplier.name} (Total: ${total}, Paid: ${paid}, Remaining: ${remaining})`,
      );
    } else {
      console.log(`Purchase invoice ${invoiceNumber} already exists; skipping invoice creation`);
    }

    // 3. Record a standalone debt settlement payment (paying off 1500 of existing debt)
    const existingStandalone = await supplierPaymentModel
      .findOne({
        supplierId: supplier._id,
        purchaseInvoiceId: null,
        amount: 1500,
      })
      .exec();

    if (!existingStandalone && supplier.amountOwed >= 1500) {
      await supplierPaymentModel.create({
        supplierId: supplier._id,
        purchaseInvoiceId: null,
        amount: 1500,
        method: PaymentMethod.CASH,
        notes: 'سداد نقدي من حساب المديونية القديمة',
        recordedBy: user._id,
        reversedAt: null,
        reversedBy: null,
      });

      supplier.amountOwed = roundMoney(supplier.amountOwed - 1500);
      await supplier.save();

      console.log(
        `Recorded standalone supplier payment of 1500 EGP for supplier ${supplier.name} (New amountOwed: ${supplier.amountOwed})`,
      );
    } else {
      console.log('Standalone supplier payment already exists or debt is insufficient; skipping.');
    }

    console.log('Purchases and Supplier Payments seed completed.');
  } finally {
    await app.close();
  }
}

seedPurchases().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
