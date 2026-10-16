import { NestFactory } from '@nestjs/core';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import { AppModule } from '../app.module';
import { Category, CategoryDocument } from '../modules/categories/schemas/category.schema';
import { InventoryService } from '../modules/inventory/inventory.service';
import { Item, ItemDocument } from '../modules/items/schemas/item.schema';
import { User, UserDocument } from '../modules/users/schemas/user.schema';
import { PricingMode } from '../shared/enums/pricing-mode.enum';
import { roundMoney } from '../shared/utils/round-money/round-money.util';

interface TestItemSeed {
  code: string;
  name: string;
  categoryName: string;
  isWood: boolean;
  pricingMode: PricingMode;
  unitPrice: number;
  cost: number;
  stockQuantity: number;
  reorderThreshold: number;
}

const INVENTORY_ITEMS_SEED: TestItemSeed[] = [
  {
    code: 'TEST-LOW-STOCK',
    name: 'شريط قشاط PVC أبيض (منخفض)',
    categoryName: 'PVC',
    isWood: false,
    pricingMode: PricingMode.PER_PIECE,
    unitPrice: 35,
    cost: 20,
    stockQuantity: 3, // Low stock: <= 5 reorderThreshold
    reorderThreshold: 5,
  },
  {
    code: 'TEST-OUT-STOCK',
    name: 'لوح MDF عازل 12mm (منتهي)',
    categoryName: 'ساده MDF',
    isWood: false,
    pricingMode: PricingMode.PER_PIECE,
    unitPrice: 380,
    cost: 300,
    stockQuantity: 0, // Out of stock
    reorderThreshold: 10,
  },
  {
    code: 'TEST-NEG-STOCK',
    name: 'خشب زان روماني (سالب)',
    categoryName: 'خشب',
    isWood: true,
    pricingMode: PricingMode.PER_CUBIC_METER,
    unitPrice: 16000,
    cost: 12500,
    stockQuantity: -0.5, // Negative stock: emergency sale before purchase
    reorderThreshold: 2,
  },
];

export async function seedInventory() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const itemModel = app.get<Model<ItemDocument>>(getModelToken(Item.name));
    const categoryModel = app.get<Model<CategoryDocument>>(getModelToken(Category.name));
    const userModel = app.get<Model<UserDocument>>(getModelToken(User.name));
    const connection = app.get<Connection>(getConnectionToken());
    const inventoryService = app.get(InventoryService);

    const user = await userModel.findOne({ isDeleted: false }).exec();
    if (!user) {
      throw new Error('No user found. Please run seed:super-admin first.');
    }

    // 1. Ensure test stock items exist for realistic frontend states
    for (const seed of INVENTORY_ITEMS_SEED) {
      const existing = await itemModel.findOne({ code: seed.code, isDeleted: false }).exec();
      if (!existing) {
        let category = await categoryModel.findOne({ name: seed.categoryName, isDeleted: false }).exec();
        if (!category) {
          category = await categoryModel.create({ name: seed.categoryName });
        }

        await itemModel.create({
          code: seed.code,
          name: seed.name,
          categoryId: category._id,
          isWood: seed.isWood,
          pricingMode: seed.pricingMode,
          dimensionDefaults: { thickness: [], width: [], length: [] },
          unitPrice: roundMoney(seed.unitPrice),
          cost: roundMoney(seed.cost),
          stockQuantity: seed.stockQuantity,
          reorderThreshold: seed.reorderThreshold,
          isActive: true,
          isDeleted: false,
        });
        console.log(`Created inventory test item: ${seed.name} (${seed.code}) - Stock: ${seed.stockQuantity}`);
      } else {
        console.log(`Item ${seed.code} already exists; skipping item creation.`);
      }
    }

    // 2. Seed one manual stock adjustment as an audit row
    let targetItem = await itemModel.findOne({ code: 'MDF-18', isDeleted: false }).exec();
    if (!targetItem) {
      targetItem = await itemModel.findOne({ isDeleted: false }).exec();
    }
    if (targetItem) {
      const existingAdjustment = await connection.collection('auditlogs').findOne({
        entityId: targetItem._id,
        action: 'stock_adjusted',
      });
      if (!existingAdjustment) {
        const oldQty = targetItem.stockQuantity;
        const newQty = roundMoney(oldQty + 2);

        await inventoryService.adjustStock(
          {
            itemId: targetItem._id.toString(),
            newQuantity: newQty,
            reason: 'جرد فعلي سنوي في المخزن الرئيسي وتم تصحيح الرصيد بعد الفرز',
          },
          {
            id: user._id.toString(),
            username: user.username,
            role: user.role,
          },
        );

        console.log(`Created sample stock adjustment for ${targetItem.code}: ${oldQty} → ${newQty}`);
      } else {
        console.log('Stock adjustment for MDF-18 already exists; skipping.');
      }
    }

    console.log('Inventory seed completed.');
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  seedInventory().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
