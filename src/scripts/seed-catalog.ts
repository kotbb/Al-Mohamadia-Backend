import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppModule } from '../app.module';
import { Category, CategoryDocument } from '../modules/categories/schemas/category.schema';
import { Item, ItemDocument } from '../modules/items/schemas/item.schema';
import { PricingMode } from '../shared/enums/pricing-mode.enum';
import { roundMoney } from '../shared/utils/round-money/round-money.util';

interface CategorySeed {
  name: string;
}

interface ItemSeed {
  code: string;
  name: string;
  categoryName: string;
  isWood: boolean;
  pricingMode: PricingMode;
  unitPrice: number;
  cost: number;
  stockQuantity: number;
  reorderThreshold: number;
  dimensionDefaults: { thickness: number[]; width: number[]; length: number[] };
}

const CATEGORY_SEEDS: CategorySeed[] = [{ name: 'ساده MDF' }, { name: 'خشب' }, { name: 'PVC' }];

const ITEM_SEEDS: ItemSeed[] = [
  {
    code: 'MDF-18',
    name: 'لوح MDF 18mm',
    categoryName: 'ساده MDF',
    isWood: false,
    pricingMode: PricingMode.PER_PIECE,
    unitPrice: 450,
    cost: 380,
    stockQuantity: 48,
    reorderThreshold: 10,
    dimensionDefaults: { thickness: [0.018], width: [1.22], length: [2.44] },
  },
  {
    code: 'MDF-25',
    name: 'لوح MDF 25mm',
    categoryName: 'ساده MDF',
    isWood: false,
    pricingMode: PricingMode.PER_PIECE,
    unitPrice: 620,
    cost: 520,
    stockQuantity: 32,
    reorderThreshold: 8,
    dimensionDefaults: { thickness: [0.025], width: [1.22, 1.525], length: [2.44, 3.05] },
  },
  {
    code: 'WOOD-BALADI',
    name: 'خشب بلدي',
    categoryName: 'خشب',
    isWood: true,
    pricingMode: PricingMode.PER_CUBIC_METER,
    unitPrice: 850,
    cost: 720,
    stockQuantity: 12.5,
    reorderThreshold: 3,
    dimensionDefaults: { thickness: [0.02, 0.05], width: [0.1, 0.5], length: [1, 4] },
  },
  {
    code: 'WOOD-MAHOG',
    name: 'خشب ماهوجني',
    categoryName: 'خشب',
    isWood: true,
    pricingMode: PricingMode.PER_CUBIC_METER,
    unitPrice: 1250,
    cost: 980,
    stockQuantity: 6.25,
    reorderThreshold: 2,
    dimensionDefaults: { thickness: [0.05], width: [0.1], length: [4] },
  },
  {
    code: 'PVC-WHITE',
    name: 'لوح PVC أبيض',
    categoryName: 'PVC',
    isWood: false,
    pricingMode: PricingMode.PER_PIECE,
    unitPrice: 320,
    cost: 260,
    stockQuantity: 60,
    reorderThreshold: 15,
    dimensionDefaults: { thickness: [], width: [], length: [] },
  },
];

async function findOrCreateCategory(categoryModel: Model<CategoryDocument>, name: string): Promise<CategoryDocument> {
  const existing = await categoryModel.findOne({ name, isDeleted: false }).exec();
  if (existing) {
    console.log(`Category already exists: ${name}`);
    return existing;
  }

  const created = await categoryModel.create({
    name,
    isActive: true,
    isDeleted: false,
  });
  console.log(`Category created: ${name}`);
  return created;
}

async function findOrCreateItem(itemModel: Model<ItemDocument>, seed: ItemSeed, categoryId: string): Promise<void> {
  const existing = await itemModel.findOne({ code: seed.code, isDeleted: false }).exec();
  if (existing) {
    console.log(`Item already exists: ${seed.code}`);
    return;
  }

  await itemModel.create({
    code: seed.code,
    name: seed.name,
    categoryId,
    isWood: seed.isWood,
    pricingMode: seed.pricingMode,
    dimensionDefaults: seed.dimensionDefaults,
    unitPrice: roundMoney(seed.unitPrice),
    cost: roundMoney(seed.cost),
    stockQuantity: seed.stockQuantity,
    reorderThreshold: seed.reorderThreshold,
    isActive: true,
    isDeleted: false,
  });
  console.log(`Item created: ${seed.code} — ${seed.name}`);
}

export async function seedCatalog() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const categoryModel = app.get<Model<CategoryDocument>>(getModelToken(Category.name));
    const itemModel = app.get<Model<ItemDocument>>(getModelToken(Item.name));

    const categoryByName = new Map<string, CategoryDocument>();
    for (const { name } of CATEGORY_SEEDS) {
      const category = await findOrCreateCategory(categoryModel, name);
      categoryByName.set(name, category);
    }

    for (const seed of ITEM_SEEDS) {
      const category = categoryByName.get(seed.categoryName);
      if (!category) {
        throw new Error(`Missing category for item ${seed.code}: ${seed.categoryName}`);
      }
      await findOrCreateItem(itemModel, seed, category._id.toString());
    }

    console.log('Catalog seed completed.');
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  seedCatalog().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
