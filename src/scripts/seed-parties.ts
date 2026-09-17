import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppModule } from '../app.module';
import { Customer, CustomerDocument } from '../modules/customers/schemas/customer.schema';
import { Supplier, SupplierDocument } from '../modules/suppliers/schemas/supplier.schema';
import { normalizePhone } from '../shared/utils/normalize-phone/normalize-phone.util';
import { roundMoney } from '../shared/utils/round-money/round-money.util';

interface CustomerSeed {
  name: string;
  phone: string;
  address?: string;
  balance?: number;
}

interface SupplierSeed {
  name: string;
  phone?: string;
  address?: string;
  amountOwed?: number;
}

const CUSTOMER_SEEDS: CustomerSeed[] = [
  { name: 'أحمد محمد', phone: '01012345678', address: 'القاهرة، مدينة نصر', balance: 1500 },
  { name: 'محمود علي', phone: '01098765432', balance: 0 },
  { name: 'سارة حسن', phone: '01123456789', address: 'الجيزة، الدقي', balance: 320.5 },
];

const SUPPLIER_SEEDS: SupplierSeed[] = [
  {
    name: 'مؤسسة الخشب الحديث',
    phone: '0223456789',
    address: 'القاهرة، شبرا الخيمة',
    amountOwed: 8500,
  },
  { name: 'توريد PVC مصر', phone: '01055556666', amountOwed: 0 },
  { name: 'مورد محلي بدون هاتف', address: 'الإسكندرية', amountOwed: 1200 },
];

async function findOrCreateCustomer(customerModel: Model<CustomerDocument>, seed: CustomerSeed): Promise<void> {
  const phone = normalizePhone(seed.phone);
  const existing = await customerModel.findOne({ phone, isDeleted: false }).exec();
  if (existing) {
    console.log(`Customer already exists: ${seed.name} (${phone})`);
    return;
  }

  await customerModel.create({
    name: seed.name,
    phone,
    address: seed.address?.trim() ? seed.address.trim() : null,
    balance: roundMoney(seed.balance ?? 0),
    isActive: true,
    isDeleted: false,
  });
  console.log(`Customer created: ${seed.name} (${phone})`);
}

async function findOrCreateSupplier(supplierModel: Model<SupplierDocument>, seed: SupplierSeed): Promise<void> {
  const phone = seed.phone ? normalizePhone(seed.phone) : null;
  const normalizedPhone = phone && phone.length > 0 ? phone : null;

  if (normalizedPhone) {
    const existing = await supplierModel.findOne({ phone: normalizedPhone, isDeleted: false }).exec();
    if (existing) {
      console.log(`Supplier already exists: ${seed.name} (${normalizedPhone})`);
      return;
    }
  } else {
    const existing = await supplierModel.findOne({ name: seed.name, isDeleted: false }).exec();
    if (existing) {
      console.log(`Supplier already exists: ${seed.name}`);
      return;
    }
  }

  await supplierModel.create({
    name: seed.name,
    phone: normalizedPhone,
    address: seed.address?.trim() ? seed.address.trim() : null,
    amountOwed: roundMoney(seed.amountOwed ?? 0),
    isActive: true,
    isDeleted: false,
  });
  console.log(`Supplier created: ${seed.name}`);
}

async function seedParties() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const customerModel = app.get<Model<CustomerDocument>>(getModelToken(Customer.name));
    const supplierModel = app.get<Model<SupplierDocument>>(getModelToken(Supplier.name));

    for (const seed of CUSTOMER_SEEDS) {
      await findOrCreateCustomer(customerModel, seed);
    }

    for (const seed of SUPPLIER_SEEDS) {
      await findOrCreateSupplier(supplierModel, seed);
    }

    console.log('Parties seed completed.');
  } finally {
    await app.close();
  }
}

seedParties().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
