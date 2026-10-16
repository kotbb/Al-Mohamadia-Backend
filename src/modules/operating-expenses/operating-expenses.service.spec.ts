import { BadRequestException, ConflictException } from '@nestjs/common';
import { validate } from 'class-validator';
import { Types } from 'mongoose';
import { PaymentMethod } from '../../shared/enums/payment-method.enum';
import { formatCairoDate } from '../../shared/utils/period/cairo-period.util';
import { OperatingExpensesService } from './operating-expenses.service';
import { CreateOperatingExpenseDto } from './dto/request/create-operating-expense.dto';
import { OperatingExpenseSchema } from './schemas/operating-expense.schema';

describe('OperatingExpensesService', () => {
  it('keeps only isDeleted as the expense soft-delete field', () => {
    expect(OperatingExpenseSchema.path('isDeleted')).toBeDefined();
    expect(OperatingExpenseSchema.path('voidedAt')).toBeUndefined();
    expect(OperatingExpenseSchema.path('voidedBy')).toBeUndefined();
    expect(OperatingExpenseSchema.path('receiptReference')).toBeUndefined();
  });
  const categoryId = new Types.ObjectId();
  const expenseId = new Types.ObjectId();
  const user = { id: new Types.ObjectId().toString() };
  const session = { withTransaction: jest.fn(async (work: () => Promise<void>) => work()), endSession: jest.fn() };
  const categories = {
    findById: jest.fn(),
  };
  const expenses = {
    create: jest.fn(),
    findById: jest.fn(),
    find: jest.fn(),
    countDocuments: jest.fn(),
    aggregate: jest.fn(),
  };
  const connection = { startSession: jest.fn().mockResolvedValue(session) };
  const audit = { log: jest.fn() };
  const service = new OperatingExpensesService(
    categories as never,
    expenses as never,
    connection as never,
    audit as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    categories.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue({ isActive: true }) });
  });

  it('rejects impossible and future Cairo dates before writing', async () => {
    const input = {
      categoryId: categoryId.toString(),
      amount: 25,
      method: PaymentMethod.CASH,
      expenseDate: '2026-02-30',
    };
    await expect(service.createExpense(input, user as never)).rejects.toThrow(BadRequestException);
    await expect(service.createExpense({ ...input, expenseDate: '9999-01-01' }, user as never)).rejects.toThrow(
      BadRequestException,
    );
    expect(expenses.create).not.toHaveBeenCalled();
  });

  it('rejects non-positive and fractional-cent amounts in the request contract', async () => {
    const dto = Object.assign(new CreateOperatingExpenseDto(), {
      categoryId: categoryId.toString(),
      expenseDate: formatCairoDate(new Date()),
      method: PaymentMethod.CASH,
    });
    dto.amount = 0;
    expect((await validate(dto)).some((error) => error.property === 'amount')).toBe(true);
    dto.amount = 1.001;
    expect((await validate(dto)).some((error) => error.property === 'amount')).toBe(true);
    dto.amount = 1.25;
    expect((await validate(dto)).some((error) => error.property === 'amount')).toBe(false);
  });

  it('summarizes all non-deleted rows matching filters, independent of page', async () => {
    const query = {
      from: '2026-10-01',
      to: '2026-10-15',
      categoryId: categoryId.toString(),
      page: 2,
      limit: 10,
    };
    expenses.find.mockReturnValue({
      sort: () => ({ skip: () => ({ limit: () => ({ exec: jest.fn().mockResolvedValue([]) }) }) }),
    });
    expenses.countDocuments.mockReturnValue({ exec: jest.fn().mockResolvedValue(12) });
    expenses.aggregate.mockResolvedValue([{ _id: categoryId, amount: 300, count: 4 }]);
    const result = await service.listExpenses(query);
    expect(result.meta).toEqual({ page: 2, limit: 10, total: 12 });
    expect(result.summary).toEqual({ totalAmount: 300, count: 4, topCategoryId: categoryId.toString() });
    const pipeline = expenses.aggregate.mock.calls[0][0] as Array<{ $match?: Record<string, unknown> }>;
    expect(pipeline[0].$match).toMatchObject({
      isDeleted: false,
      categoryId,
      expenseDate: { $gte: query.from, $lte: query.to },
    });
    expect(expenses.find.mock.calls[0][0]).toMatchObject({ isDeleted: false });
  });

  it('allows an unchanged deactivated category during an audited edit, then soft deletes terminally', async () => {
    const doc = {
      _id: expenseId,
      categoryId,
      amount: 100,
      expenseDate: formatCairoDate(new Date()),
      method: PaymentMethod.CASH,
      payee: null,
      notes: null,
      recordedBy: new Types.ObjectId(),
      isDeleted: false,
      get: jest.fn((key: string) =>
        key === 'createdAt' || key === 'updatedAt' ? new Date() : (doc as Record<string, unknown>)[key],
      ),
      set: jest.fn((key: string, value: unknown) => {
        (doc as Record<string, unknown>)[key] = value;
      }),
      save: jest.fn(),
    };
    expenses.findById.mockReturnValue({ session: () => ({ exec: jest.fn().mockResolvedValue(doc) }) });
    const changed = await service.updateExpense(
      expenseId.toString(),
      { categoryId: categoryId.toString(), amount: 125 },
      user as never,
    );
    expect(changed.amount).toBe(125);
    expect(categories.findById).not.toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'operating_expense_updated', changes: { amount: { old: 100, new: 125 } } }),
      session,
    );
    await service.deleteExpense(expenseId.toString(), user as never);
    expect(doc.isDeleted).toBe(true);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'operating_expense_deleted' }), session);
    await expect(service.updateExpense(expenseId.toString(), { amount: 150 }, user as never)).rejects.toThrow(
      ConflictException,
    );
    await expect(service.deleteExpense(expenseId.toString(), user as never)).rejects.toThrow(ConflictException);
  });
});
