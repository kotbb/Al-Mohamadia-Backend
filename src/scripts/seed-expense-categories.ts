import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppModule } from '../app.module';
import {
  ExpenseCategory,
  ExpenseCategoryDocument,
} from '../modules/operating-expenses/schemas/expense-category.schema';

const STARTER_CATEGORIES = ['الإيجار', 'الأجور', 'المرافق', 'النقل', 'الصيانة', 'أخرى'] as const;

export async function seedExpenseCategories() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const model = app.get<Model<ExpenseCategoryDocument>>(getModelToken(ExpenseCategory.name));
    for (const code of STARTER_CATEGORIES) {
      await model.updateOne({ code }, { $setOnInsert: { code, name: null, isActive: true } }, { upsert: true });
    }
    console.log('Expense category seed completed.');
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  seedExpenseCategories().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
