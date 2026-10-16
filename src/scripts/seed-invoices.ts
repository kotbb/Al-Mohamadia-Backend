import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AppModule } from '../app.module';
import { Customer, CustomerDocument } from '../modules/customers/schemas/customer.schema';
import { Item, ItemDocument } from '../modules/items/schemas/item.schema';
import { User, UserDocument } from '../modules/users/schemas/user.schema';
import { InvoiceCounter, InvoiceCounterDocument } from '../modules/sales-invoices/schemas/invoice-counter.schema';
import { Payment, PaymentDocument } from '../modules/payments/schemas/payment.schema';
import { SalesInvoice, SalesInvoiceDocument } from '../modules/sales-invoices/schemas/sales-invoice.schema';
import { PricingMode } from '../shared/enums/pricing-mode.enum';
import { SalesInvoiceStatus } from '../shared/enums/sales-invoice-status.enum';
import { SalesInvoiceType } from '../shared/enums/sales-invoice-type.enum';
import { cairoYearNow } from '../shared/utils/period/cairo-period.util';
import { roundMoney } from '../shared/utils/round-money/round-money.util';
import { lineTotalForPricing, stockDeltaForLine } from '../shared/utils/volume/cubic-meter.util';

export async function seedInvoices() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const salesInvoiceModel = app.get<Model<SalesInvoiceDocument>>(getModelToken(SalesInvoice.name));
    const paymentModel = app.get<Model<PaymentDocument>>(getModelToken(Payment.name));
    const counterModel = app.get<Model<InvoiceCounterDocument>>(getModelToken(InvoiceCounter.name));
    const itemModel = app.get<Model<ItemDocument>>(getModelToken(Item.name));
    const customerModel = app.get<Model<CustomerDocument>>(getModelToken(Customer.name));
    const userModel = app.get<Model<UserDocument>>(getModelToken(User.name));

    const year = cairoYearNow();
    const cashNumber = `INV-9001`;
    const customerNumber = `INV-9002`;

    const existingCash = await salesInvoiceModel.findOne({ invoiceNumber: cashNumber }).exec();
    const existingCustomer = await salesInvoiceModel.findOne({ invoiceNumber: customerNumber }).exec();
    if (existingCash && existingCustomer) {
      console.log('Seed invoices already exist; skipping');
      return;
    }

    const pieceItem = await itemModel.findOne({ code: 'MDF-18', isDeleted: false, isActive: true }).exec();
    const cubicItem = await itemModel.findOne({ code: 'WOOD-BALADI', isDeleted: false, isActive: true }).exec();
    const customer = await customerModel.findOne({ phone: '01012345678', isDeleted: false, isActive: true }).exec();
    const user = await userModel.findOne({ isDeleted: false }).exec();

    if (!pieceItem || !cubicItem || !customer || !user) {
      throw new Error('Missing seed prerequisites. Run seed:super-admin, seed:catalog, and seed:parties first.');
    }

    const createdBy = user._id;

    if (!existingCash) {
      const piecePrice = roundMoney(pieceItem.unitPrice);
      const lineTotal = roundMoney(
        lineTotalForPricing({
          pricingMode: PricingMode.PER_PIECE,
          quantity: 2,
          piecePrice,
        }),
      );
      const stockDelta = stockDeltaForLine({
        pricingMode: PricingMode.PER_PIECE,
        quantity: 2,
      });

      const [invoice] = await salesInvoiceModel.create([
        {
          invoiceNumber: cashNumber,
          type: SalesInvoiceType.CASH_SALE,
          customerId: null,
          lines: [
            {
              itemId: pieceItem._id,
              quantity: 2,
              width: 1.22,
              length: 2.44,
              thickness: 0.018,
              pricingModeSnapshot: PricingMode.PER_PIECE,
              piecePrice,
              costPriceSnapshot: roundMoney(pieceItem.cost),
              lineTotal,
              note: 'seed cash',
            },
          ],
          total: lineTotal,
          discount: 0,
          paid: lineTotal,
          remaining: 0,
          status: SalesInvoiceStatus.SAVED,
          createdBy,
        },
      ]);

      await itemModel.updateOne({ _id: pieceItem._id }, { $inc: { stockQuantity: -stockDelta } });
      await paymentModel.create({
        customerId: null,
        invoiceId: invoice._id,
        amount: lineTotal,
        recordedBy: createdBy,
        reversedAt: null,
        reversedBy: null,
      });
      console.log(`Cash invoice created: ${cashNumber}`);
    }

    if (!existingCustomer) {
      const piecePrice = roundMoney(cubicItem.unitPrice);
      const thickness = 0.02;
      const width = 0.5;
      const length = 1;
      const quantity = 2;
      const lineTotal = roundMoney(
        lineTotalForPricing({
          pricingMode: PricingMode.PER_CUBIC_METER,
          quantity,
          piecePrice,
          thicknessM: thickness,
          widthM: width,
          lengthM: length,
        }),
      );
      const stockDelta = stockDeltaForLine({
        pricingMode: PricingMode.PER_CUBIC_METER,
        quantity,
        thicknessM: thickness,
        widthM: width,
        lengthM: length,
      });
      const paid = roundMoney(lineTotal / 2);
      const remaining = roundMoney(lineTotal - paid);

      const [invoice] = await salesInvoiceModel.create([
        {
          invoiceNumber: customerNumber,
          type: SalesInvoiceType.CUSTOMER_SALE,
          customerId: customer._id,
          lines: [
            {
              itemId: cubicItem._id,
              quantity,
              width,
              length,
              thickness,
              pricingModeSnapshot: PricingMode.PER_CUBIC_METER,
              piecePrice,
              costPriceSnapshot: roundMoney(cubicItem.cost),
              lineTotal,
              note: 'seed customer',
            },
          ],
          total: lineTotal,
          discount: 0,
          paid,
          remaining,
          status: SalesInvoiceStatus.SAVED,
          createdBy,
        },
      ]);

      await itemModel.updateOne({ _id: cubicItem._id }, { $inc: { stockQuantity: -stockDelta } });
      customer.balance = roundMoney(customer.balance + remaining);
      await customer.save();
      await paymentModel.create({
        customerId: customer._id,
        invoiceId: invoice._id,
        amount: paid,
        recordedBy: createdBy,
        reversedAt: null,
        reversedBy: null,
      });
      console.log(`Customer invoice created: ${customerNumber}`);
    }

    const key = `sales:${year}`;
    const counter = await counterModel.findOne({ key }).exec();
    if (!counter || counter.seq < 9002) {
      await counterModel.findOneAndUpdate({ key }, { $set: { seq: 9002 } }, { upsert: true });
    }

    console.log('seed:invoices complete');
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  seedInvoices().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
