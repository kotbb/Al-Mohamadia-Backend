import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import type { AuthUser } from '../../shared/auth/interfaces/auth-user.interface';
import { formatCairoDate, parseIsoDateParts } from '../../shared/utils/period/cairo-period.util';
import { roundMoney } from '../../shared/utils/round-money/round-money.util';
import { AuditService } from '../audit/audit.service';
import { CreateExpenseCategoryDto } from './dto/create-expense-category.dto';
import { CreateOperatingExpenseDto } from './dto/create-operating-expense.dto';
import { ListOperatingExpensesQueryDto } from './dto/list-operating-expenses-query.dto';
import { UpdateExpenseCategoryDto } from './dto/update-expense-category.dto';
import { UpdateOperatingExpenseDto } from './dto/update-operating-expense.dto';
import { ExpenseCategory, ExpenseCategoryDocument } from './schemas/expense-category.schema';
import { OperatingExpense, OperatingExpenseDocument } from './schemas/operating-expense.schema';

@Injectable()
export class OperatingExpensesService {
  constructor(
    @InjectModel(ExpenseCategory.name) private readonly categories: Model<ExpenseCategoryDocument>,
    @InjectModel(OperatingExpense.name) private readonly expenses: Model<OperatingExpenseDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly audit: AuditService,
  ) {}

  private validateExpenseDate(value: string): void {
    try {
      parseIsoDateParts(value);
    } catch {
      throw new BadRequestException('Invalid expense date');
    }
    if (value > formatCairoDate(new Date())) throw new BadRequestException('Expense date cannot be in the future');
  }

  private text(value: string | null | undefined): string | null {
    return value?.trim() || null;
  }

  private categoryDto(doc: ExpenseCategoryDocument) {
    return { id: doc._id.toString(), code: doc.code, name: doc.name, isActive: doc.isActive };
  }

  private expenseDto(doc: OperatingExpenseDocument) {
    return {
      id: doc._id.toString(),
      categoryId: doc.categoryId.toString(),
      amount: doc.amount,
      expenseDate: doc.expenseDate,
      method: doc.method,
      payee: doc.payee,
      notes: doc.notes,
      recordedBy: doc.recordedBy.toString(),
      isDeleted: doc.isDeleted,
      createdAt: doc.get('createdAt') as Date,
      updatedAt: doc.get('updatedAt') as Date,
    };
  }

  async listCategories() {
    return (await this.categories.find().sort({ code: 1, name: 1 }).exec()).map((doc) => this.categoryDto(doc));
  }

  async createCategory(dto: CreateExpenseCategoryDto, user: AuthUser) {
    const name = this.text(dto.name);
    if (!name) throw new BadRequestException('Category name is required');
    if (await this.categories.exists({ name })) throw new ConflictException('Expense category name already exists');
    const session = await this.connection.startSession();
    try {
      let created!: ExpenseCategoryDocument;
      await session.withTransaction(async () => {
        [created] = await this.categories.create([{ code: null, name, isActive: true }], { session });
        await this.audit.log(
          {
            userId: user.id,
            action: 'expense_category_created',
            entityType: 'ExpenseCategory',
            entityId: created._id.toString(),
            changes: { name: { old: null, new: name } },
          },
          session,
        );
      });
      return this.categoryDto(created);
    } finally {
      await session.endSession();
    }
  }

  async updateCategory(id: string, dto: UpdateExpenseCategoryDto, user: AuthUser) {
    const session = await this.connection.startSession();
    try {
      let result!: ExpenseCategoryDocument;
      await session.withTransaction(async () => {
        const doc = await this.categories.findById(id).session(session).exec();
        if (!doc) throw new NotFoundException('Expense category not found');
        const changes: Record<string, { old: unknown; new: unknown }> = {};
        if (dto.name !== undefined) {
          const name = this.text(dto.name);
          if (!name) throw new BadRequestException('Category name is required');
          if (name !== doc.name) {
            if (await this.categories.exists({ name, _id: { $ne: doc._id } }).session(session))
              throw new ConflictException('Expense category name already exists');
            changes.name = { old: doc.name, new: name };
            doc.name = name;
          }
        }
        if (dto.isActive !== undefined && dto.isActive !== doc.isActive) {
          changes.isActive = { old: doc.isActive, new: dto.isActive };
          doc.isActive = dto.isActive;
        }
        if (Object.keys(changes).length) {
          await doc.save({ session });
          await this.audit.log(
            {
              userId: user.id,
              action: 'expense_category_updated',
              entityType: 'ExpenseCategory',
              entityId: id,
              changes,
            },
            session,
          );
        }
        result = doc;
      });
      return this.categoryDto(result);
    } finally {
      await session.endSession();
    }
  }

  private async activeCategory(id: string): Promise<void> {
    const category = await this.categories.findById(id).exec();
    if (!category || !category.isActive) throw new BadRequestException('Choose an active expense category');
  }

  async createExpense(dto: CreateOperatingExpenseDto, user: AuthUser) {
    this.validateExpenseDate(dto.expenseDate);
    await this.activeCategory(dto.categoryId);
    const session = await this.connection.startSession();
    try {
      let created!: OperatingExpenseDocument;
      await session.withTransaction(async () => {
        [created] = await this.expenses.create(
          [
            {
              categoryId: new Types.ObjectId(dto.categoryId),
              amount: roundMoney(dto.amount),
              expenseDate: dto.expenseDate,
              method: dto.method,
              payee: this.text(dto.payee),
              notes: this.text(dto.notes),
              recordedBy: new Types.ObjectId(user.id),
              isDeleted: false,
            },
          ],
          { session },
        );
        await this.audit.log(
          {
            userId: user.id,
            action: 'operating_expense_created',
            entityType: 'OperatingExpense',
            entityId: created._id.toString(),
            changes: {
              categoryId: { old: null, new: dto.categoryId },
              amount: { old: null, new: created.amount },
              expenseDate: { old: null, new: created.expenseDate },
              method: { old: null, new: created.method },
              payee: { old: null, new: created.payee },
              notes: { old: null, new: created.notes },
            },
          },
          session,
        );
      });
      return this.expenseDto(created);
    } finally {
      await session.endSession();
    }
  }

  async getExpense(id: string) {
    const doc = await this.expenses.findById(id).exec();
    if (!doc) throw new NotFoundException('Operating expense not found');
    return this.expenseDto(doc);
  }

  async updateExpense(id: string, dto: UpdateOperatingExpenseDto, user: AuthUser) {
    if (dto.expenseDate !== undefined) this.validateExpenseDate(dto.expenseDate);
    const session = await this.connection.startSession();
    try {
      let result!: OperatingExpenseDocument;
      await session.withTransaction(async () => {
        const doc = await this.expenses.findById(id).session(session).exec();
        if (!doc) throw new NotFoundException('Operating expense not found');
        if (doc.isDeleted) throw new ConflictException('Deleted expenses cannot be edited');
        if (dto.categoryId && dto.categoryId !== doc.categoryId.toString()) await this.activeCategory(dto.categoryId);
        const changes: Record<string, { old: unknown; new: unknown }> = {};
        const values = {
          categoryId: dto.categoryId ? new Types.ObjectId(dto.categoryId) : undefined,
          amount: dto.amount === undefined ? undefined : roundMoney(dto.amount),
          expenseDate: dto.expenseDate,
          method: dto.method,
          payee: dto.payee === undefined ? undefined : this.text(dto.payee),
          notes: dto.notes === undefined ? undefined : this.text(dto.notes),
        };
        for (const [key, value] of Object.entries(values)) {
          if (value === undefined) continue;
          const previous = doc.get(key) as unknown;
          const oldValue = previous instanceof Types.ObjectId ? previous.toString() : previous;
          const newValue = value instanceof Types.ObjectId ? value.toString() : value;
          if (oldValue !== newValue) {
            changes[key] = { old: oldValue, new: newValue };
            doc.set(key, value);
          }
        }
        if (Object.keys(changes).length) {
          await doc.save({ session });
          await this.audit.log(
            {
              userId: user.id,
              action: 'operating_expense_updated',
              entityType: 'OperatingExpense',
              entityId: id,
              changes,
            },
            session,
          );
        }
        result = doc;
      });
      return this.expenseDto(result);
    } finally {
      await session.endSession();
    }
  }

  async deleteExpense(id: string, user: AuthUser) {
    const session = await this.connection.startSession();
    try {
      let result!: OperatingExpenseDocument;
      await session.withTransaction(async () => {
        const doc = await this.expenses.findById(id).session(session).exec();
        if (!doc) throw new NotFoundException('Operating expense not found');
        if (doc.isDeleted) throw new ConflictException('Operating expense already deleted');
        doc.isDeleted = true;
        await doc.save({ session });
        await this.audit.log(
          {
            userId: user.id,
            action: 'operating_expense_deleted',
            entityType: 'OperatingExpense',
            entityId: id,
            changes: { isDeleted: { old: false, new: true } },
          },
          session,
        );
        result = doc;
      });
      return this.expenseDto(result);
    } finally {
      await session.endSession();
    }
  }

  async listExpenses(query: ListOperatingExpensesQueryDto) {
    try {
      if (query.from) parseIsoDateParts(query.from);
      if (query.to) parseIsoDateParts(query.to);
    } catch {
      throw new BadRequestException('Invalid date range');
    }
    if (query.from && query.to && query.from > query.to) throw new BadRequestException('from must be before to');
    const filter: Record<string, unknown> = {};
    if (query.from || query.to)
      filter.expenseDate = { ...(query.from ? { $gte: query.from } : {}), ...(query.to ? { $lte: query.to } : {}) };
    if (query.categoryId) filter.categoryId = new Types.ObjectId(query.categoryId);
    if (query.method) filter.method = query.method;
    if (query.search?.trim()) {
      const safe = query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [{ payee: { $regex: safe, $options: 'i' } }, { notes: { $regex: safe, $options: 'i' } }];
    }
    const activeFilter = { ...filter, isDeleted: false };
    const rowFilter = activeFilter;
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const [docs, total, grouped] = await Promise.all([
      this.expenses
        .find(rowFilter)
        .sort({ expenseDate: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.expenses.countDocuments(rowFilter).exec(),
      this.expenses.aggregate<{ _id: Types.ObjectId; amount: number; count: number }>([
        { $match: activeFilter },
        { $group: { _id: '$categoryId', amount: { $sum: '$amount' }, count: { $sum: 1 } } },
        { $sort: { amount: -1, _id: 1 } },
      ]),
    ]);
    return {
      items: docs.map((doc) => this.expenseDto(doc)),
      meta: { page, limit, total },
      summary: {
        totalAmount: roundMoney(grouped.reduce((sum, row) => sum + row.amount, 0)),
        count: grouped.reduce((sum, row) => sum + row.count, 0),
        topCategoryId: grouped[0]?._id.toString() ?? null,
      },
    };
  }
}
