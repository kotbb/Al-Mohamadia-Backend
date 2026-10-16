import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditModule } from '../audit/audit.module';
import { ExpenseCategory, ExpenseCategorySchema } from './schemas/expense-category.schema';
import { OperatingExpense, OperatingExpenseSchema } from './schemas/operating-expense.schema';
import { OperatingExpensesController } from './operating-expenses.controller';
import { OperatingExpensesService } from './operating-expenses.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ExpenseCategory.name, schema: ExpenseCategorySchema },
      { name: OperatingExpense.name, schema: OperatingExpenseSchema },
    ]),
    AuditModule,
  ],
  controllers: [OperatingExpensesController],
  providers: [OperatingExpensesService],
  exports: [OperatingExpensesService],
})
export class OperatingExpensesModule {}
