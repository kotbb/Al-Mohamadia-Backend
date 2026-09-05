import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { CustomersService } from './customers.service';
import { Customer } from './schemas/customer.schema';
import { AuditService } from '../audit/audit.service';
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

    auditService = { log: jest.fn().mockResolvedValue({}) };
    connection = { startSession: jest.fn().mockResolvedValue(session) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomersService,
        { provide: getModelToken(Customer.name), useValue: customerModel },
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

  describe('create', () => {
    it('creates with opening balance and writes audit', async () => {
      const result = await service.create(
        {
          name: 'أحمد',
          phone: '010 1234-5678',
          address: 'القاهرة، مدينة نصر',
          balance: 100.556,
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
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'customer_created' }),
        session,
      );
      expect(result.balance).toBe(100);
    });

    it('throws ConflictException when phone exists', async () => {
      customerModel.findOne.mockReturnValue({
        lean: () => ({ exec: () => Promise.resolve({ phone: '01012345678' }) }),
      });

      await expect(
        service.create({ name: 'أحمد', phone: '01012345678' }, actor),
      ).rejects.toThrow(ConflictException);
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
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'customer_deleted' }),
        session,
      );
      expect(result.isDeleted).toBe(true);
    });
  });

  describe('merge', () => {
    const sourceId2 = '507f1f77bcf86cd799439013';

    it('rejects when sourceIds include targetId', async () => {
      await expect(
        service.merge({ targetId: sourceId, sourceIds: [sourceId] }, actor),
      ).rejects.toThrow(BadRequestException);
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

      const result = await service.merge(
        { targetId, sourceIds: [sourceId, sourceId2] },
        actor,
      );

      expect(target.balance).toBe(125);
      expect(source1.isDeleted).toBe(true);
      expect(source2.isDeleted).toBe(true);
      expect(source1.balance).toBe(0);
      expect(source2.balance).toBe(0);
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'customer_merged',
          changes: expect.objectContaining({
            sourceIds: { old: null, new: [sourceId, sourceId2] },
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

      await expect(
        service.merge({ targetId, sourceIds: [sourceId, sourceId2] }, actor),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
