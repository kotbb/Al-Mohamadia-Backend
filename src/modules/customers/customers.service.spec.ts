import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { CustomersService } from './customers.service';
import { Customer } from './schemas/customer.schema';
import { AuditService } from '../audit/audit.service';
import { Payment } from '../payments/schemas/payment.schema';
import { SalesInvoice } from '../sales-invoices/schemas/sales-invoice.schema';
import { UserRole } from '../../shared/auth/enums/user-role.enum';
import { AuthUser } from '../../shared/auth/interfaces/auth-user.interface';

describe('CustomersService', () => {
  let service: CustomersService;
  let customerModel: {
    findOne: jest.Mock;
    create: jest.Mock;
    find: jest.Mock;
    countDocuments: jest.Mock;
    aggregate: jest.Mock;
  };
  let salesInvoiceModel: { updateMany: jest.Mock; aggregate: jest.Mock };
  let paymentModel: { updateMany: jest.Mock; aggregate: jest.Mock };
  let auditService: { log: jest.Mock };
  let connection: { startSession: jest.Mock };
  let session: {
    startTransaction: jest.Mock;
    commitTransaction: jest.Mock;
    abortTransaction: jest.Mock;
    endSession: jest.Mock;
  };

  const actor: AuthUser = {
    id: '507f1f77bcf86cd799439099',
    username: 'admin',
    role: UserRole.ADMIN,
  };

  const sourceId = '507f1f77bcf86cd799439011';
  const targetId = '507f1f77bcf86cd799439012';

  const makeCustomer = (overrides: Record<string, unknown> = {}) => ({
    _id: { toString: () => sourceId },
    name: 'أحمد',
    phone: '01012345678',
    balance: 0,
    isActive: true,
    isDeleted: false,
    save: jest.fn().mockResolvedValue(undefined),
    get: (key: string) => (key === 'createdAt' ? new Date() : undefined),
    ...overrides,
  });

  beforeEach(async () => {
    session = {
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      abortTransaction: jest.fn(),
      endSession: jest.fn(),
    };

    customerModel = {
      findOne: jest.fn().mockReturnValue({
        lean: () => ({ exec: () => Promise.resolve(null) }),
        exec: () => Promise.resolve(makeCustomer()),
      }),
      create: jest.fn().mockResolvedValue([makeCustomer({ balance: 100 })]),
      find: jest.fn().mockReturnValue({
        sort: () => ({
          skip: () => ({
            limit: () => ({
              exec: () => Promise.resolve([makeCustomer({ balance: 100 })]),
            }),
          }),
        }),
      }),
      countDocuments: jest.fn().mockReturnValue({ exec: () => Promise.resolve(1) }),
      aggregate: jest.fn().mockReturnValue({
        exec: () => Promise.resolve([{ totalDebt: 100 }]),
      }),
    };

    salesInvoiceModel = {
      aggregate: jest.fn().mockReturnValue({ session: jest.fn().mockReturnThis(), exec: () => Promise.resolve([]) }),
      updateMany: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
    };
    paymentModel = {
      aggregate: jest.fn().mockReturnValue({ session: jest.fn().mockReturnThis(), exec: () => Promise.resolve([]) }),
      updateMany: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
    };
    auditService = { log: jest.fn().mockResolvedValue({}) };
    connection = { startSession: jest.fn().mockResolvedValue(session) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomersService,
        { provide: getModelToken(Customer.name), useValue: customerModel },
        { provide: getModelToken(SalesInvoice.name), useValue: salesInvoiceModel },
        { provide: getModelToken(Payment.name), useValue: paymentModel },
        { provide: getConnectionToken(), useValue: connection },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get<CustomersService>(CustomersService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('searches customers by escaped name only, never by phone', async () => {
    await service.findAll({ q: 'Ali.+', page: 1, limit: 10 });
    expect(customerModel.find).toHaveBeenCalledWith({
      isDeleted: false,
      name: { $regex: 'Ali\\.\\+', $options: 'i' },
    });
  });

  describe('create', () => {
    it('creates multiple customers with no phone', async () => {
      customerModel.create.mockImplementation(([record]: Array<Record<string, unknown>>) =>
        Promise.resolve([makeCustomer(record)]),
      );
      expect((await service.create({ name: 'No phone', phone: '' }, actor)).phone).toBeNull();
      expect((await service.create({ name: 'Another customer', phone: '  ' }, actor)).phone).toBeNull();
    });

    it('allows clearing a customer phone and preserves it when omitted', async () => {
      const customer = makeCustomer();
      customerModel.findOne.mockReturnValue({ exec: () => Promise.resolve(customer) });
      expect((await service.update(sourceId, { name: 'Updated' }, actor)).phone).toBe('01012345678');
      expect((await service.update(sourceId, { phone: '' }, actor)).phone).toBeNull();
    });
    it('creates with starting balance and writes audit', async () => {
      const result = await service.create(
        {
          name: 'أحمد',
          phone: '010 1234-5678',
          address: 'القاهرة، مدينة نصر',
          balance: 100.56,
        },
        actor,
      );

      expect(customerModel.create).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            phone: '01012345678',
            address: 'القاهرة، مدينة نصر',
            balance: 100.56,
          }),
        ],
        { session },
      );
      expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'customer_created' }), session);
      expect(result.balance).toBe(100);
    });

    it('throws ConflictException when phone exists', async () => {
      customerModel.findOne.mockReturnValue({
        lean: () => ({ exec: () => Promise.resolve({ phone: '01012345678' }) }),
      });

      await expect(service.create({ name: 'أحمد', phone: '01012345678' }, actor)).rejects.toThrow(ConflictException);
    });
  });

  describe('findAll', () => {
    it('returns items, meta, and totalDebt summary', async () => {
      const result = await service.findAll({ hasDebt: true, page: 1, limit: 20 });

      expect(result.items).toHaveLength(1);
      expect(result.meta).toEqual({ page: 1, limit: 20, total: 1 });
      expect(result.summary.totalDebt).toBe(100);
      expect(customerModel.aggregate).toHaveBeenCalled();
    });
  });

  describe('softDelete', () => {
    it('blocks delete when balance is non-zero', async () => {
      customerModel.findOne.mockReturnValue({
        exec: () => Promise.resolve(makeCustomer({ balance: 50 })),
      });

      await expect(service.softDelete(sourceId, actor)).rejects.toThrow(ConflictException);
    });

    it('soft deletes zero-balance customer with customer_deleted audit', async () => {
      const customer = makeCustomer({ balance: 0 });
      customerModel.findOne.mockReturnValue({
        exec: () => Promise.resolve(customer),
      });

      const result = await service.softDelete(sourceId, actor);

      expect(customer.save).toHaveBeenCalledWith({ session });
      expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'customer_deleted' }), session);
      expect(result.isDeleted).toBe(true);
    });
  });

  describe('merge', () => {
    const sourceId2 = '507f1f77bcf86cd799439013';

    it('rejects when sourceIds include targetId', async () => {
      await expect(service.merge({ targetId: sourceId, sourceIds: [sourceId] }, actor)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('sums balances from multiple sources onto target and soft-deletes sources', async () => {
      const source1 = makeCustomer({
        _id: { toString: () => sourceId },
        balance: 40,
        name: 'مصدر 1',
      });
      const source2 = makeCustomer({
        _id: { toString: () => sourceId2 },
        balance: 25,
        name: 'مصدر 2',
        phone: '01011111111',
      });
      const target = makeCustomer({
        _id: { toString: () => targetId },
        balance: 60,
        name: 'هدف',
        phone: '01099999999',
      });

      customerModel.findOne.mockReturnValue({
        exec: () => Promise.resolve(target),
      });
      customerModel.find.mockReturnValue({
        exec: () => Promise.resolve([source1, source2]),
      });

      const result = await service.merge({ targetId, sourceIds: [sourceId, sourceId2] }, actor);

      expect(target.balance).toBe(125);
      expect(source1.isDeleted).toBe(true);
      expect(source2.isDeleted).toBe(true);
      expect(source1.balance).toBe(0);
      expect(source2.balance).toBe(0);
      expect(salesInvoiceModel.updateMany).toHaveBeenCalledWith(
        { customerId: { $in: [source1._id, source2._id] } },
        { $set: { customerId: target._id } },
        { session },
      );
      expect(paymentModel.updateMany).toHaveBeenCalledWith(
        { customerId: { $in: [source1._id, source2._id] } },
        { $set: { customerId: target._id } },
        { session },
      );
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'customer_merged',
          changes: expect.objectContaining({
            sourceIds: { old: null, new: ['مصدر 1', 'مصدر 2'] },
          }),
        }),
        session,
      );
      expect(result.id).toBe(targetId);
    });

    it('throws NotFoundException when a source is missing', async () => {
      customerModel.findOne.mockReturnValue({
        exec: () => Promise.resolve(makeCustomer({ _id: { toString: () => targetId } })),
      });
      customerModel.find.mockReturnValue({
        exec: () => Promise.resolve([makeCustomer()]),
      });

      await expect(service.merge({ targetId, sourceIds: [sourceId, sourceId2] }, actor)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('actual balance accounting', () => {
    it('returns actual debt and invoice/payment totals without writing', async () => {
      const party = makeCustomer({ balance: 30 });
      customerModel.findOne.mockReturnValue({ exec: () => Promise.resolve(party) });
      salesInvoiceModel.aggregate.mockReturnValue({ exec: () => Promise.resolve([{ total: 100 }]) });
      paymentModel.aggregate.mockReturnValue({ exec: () => Promise.resolve([{ total: 20 }]) });
      expect(await service.findOne(sourceId)).toMatchObject({
        balance: 30,
        financialSummary: { totalInvoiced: 100, totalPaid: 20 },
      });
      expect(party.save).not.toHaveBeenCalled();
    });

    it('sets current balance and audits adjustment and profile in one transaction', async () => {
      const party = makeCustomer({ balance: 130 });
      customerModel.findOne.mockReturnValue({ exec: () => Promise.resolve(party) });
      const oldName = party.name;
      const command = { balance: -70, name: 'Corrected' };
      const result = await service.update(sourceId, command, actor);
      expect(result).toMatchObject({ balance: -70, name: 'Corrected' });
      expect(customerModel.findOne).toHaveBeenCalledWith({ _id: sourceId, isDeleted: false }, null, { session });
      expect(party.save).toHaveBeenCalledWith({ session });
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'customer_edited',
          changes: expect.objectContaining({
            balance: { old: 130, new: -70 },
            balanceAdjustment: { old: 0, new: -200 },
            name: { old: oldName, new: 'Corrected' },
          }),
        }),
        session,
      );
    });

    it('does not save or audit an unchanged balance', async () => {
      const party = makeCustomer({ balance: 30 });
      customerModel.findOne.mockReturnValue({ exec: () => Promise.resolve(party) });
      const command = { balance: 30 };
      expect(await service.update(sourceId, command, actor)).toMatchObject({ balance: 30 });
      expect(party.save).not.toHaveBeenCalled();
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it('keeps the current transaction balance during contact-only edits', async () => {
      const party = makeCustomer({ balance: 300 });
      customerModel.findOne.mockReturnValue({ exec: () => Promise.resolve(party) });
      expect(await service.update(sourceId, { address: 'New address' }, actor)).toMatchObject({ balance: 300 });
      expect(customerModel.findOne).toHaveBeenCalledWith({ _id: sourceId, isDeleted: false }, null, { session });
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ changes: { address: { old: undefined, new: 'New address' } } }),
        session,
      );
    });

    it('rejects precision loss before creating an account', async () => {
      await expect(service.create({ name: 'Party', balance: 1.001 }, actor)).rejects.toThrow(BadRequestException);
      expect(customerModel.create).not.toHaveBeenCalled();
    });
  });
});
