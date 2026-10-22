import { SupplierPayment } from '../supplier-payments/schemas/supplier-payment.schema';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { SuppliersService } from './suppliers.service';
import { Supplier } from './schemas/supplier.schema';
import { AuditService } from '../audit/audit.service';
import { UserRole } from '../../shared/auth/enums/user-role.enum';
import { AuthUser } from '../../shared/auth/interfaces/auth-user.interface';

import { PurchaseInvoice } from '../purchases/schemas/purchase-invoice.schema';

describe('SuppliersService', () => {
  let service: SuppliersService;
  let supplierModel: {
    findOne: jest.Mock;
    create: jest.Mock;
    find: jest.Mock;
    countDocuments: jest.Mock;
    aggregate: jest.Mock;
  };
  let purchaseInvoiceModel: {
    aggregate: jest.Mock;
    updateMany: jest.Mock;
  };
  let paymentModel: { aggregate: jest.Mock; updateMany: jest.Mock };
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

  const sourceId = '507f1f77bcf86cd799439021';
  const targetId = '507f1f77bcf86cd799439022';

  const makeSupplier = (overrides: Record<string, unknown> = {}) => ({
    _id: { toString: () => sourceId },
    name: 'مورد',
    phone: '01055556666',
    amountOwed: 0,
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

    paymentModel = {
      updateMany: jest.fn(),
      aggregate: jest.fn().mockReturnValue({ session: jest.fn().mockReturnThis(), exec: () => Promise.resolve([]) }),
    };
    purchaseInvoiceModel = {
      aggregate: jest.fn().mockReturnValue({ session: jest.fn().mockReturnThis(), exec: () => Promise.resolve([]) }),
      updateMany: jest.fn().mockResolvedValue({ modifiedCount: 2 }),
    };

    supplierModel = {
      findOne: jest.fn().mockReturnValue({
        lean: () => ({ exec: () => Promise.resolve(null) }),
        exec: () => Promise.resolve(makeSupplier()),
      }),
      create: jest.fn().mockResolvedValue([makeSupplier({ amountOwed: 200 })]),
      find: jest.fn().mockReturnValue({
        sort: () => ({
          skip: () => ({
            limit: () => ({
              exec: () => Promise.resolve([makeSupplier({ amountOwed: 200 })]),
            }),
          }),
        }),
      }),
      countDocuments: jest.fn().mockReturnValue({ exec: () => Promise.resolve(1) }),
      aggregate: jest.fn().mockReturnValue({
        exec: () => Promise.resolve([{ totalOwed: 200 }]),
      }),
    };

    auditService = { log: jest.fn().mockResolvedValue({}) };
    connection = { startSession: jest.fn().mockResolvedValue(session) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SuppliersService,
        { provide: getModelToken(SupplierPayment.name), useValue: paymentModel },
        { provide: getModelToken(Supplier.name), useValue: supplierModel },
        { provide: getModelToken(PurchaseInvoice.name), useValue: purchaseInvoiceModel },
        { provide: getConnectionToken(), useValue: connection },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get<SuppliersService>(SuppliersService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('creates with starting amountOwed and optional null phone', async () => {
      const result = await service.create({ name: 'مورد', address: 'الإسكندرية', amountOwed: 200.44 }, actor);

      expect(supplierModel.create).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            phone: null,
            address: 'الإسكندرية',
            amountOwed: 200.44,
          }),
        ],
        { session },
      );
      expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'supplier_created' }), session);
      expect(result.amountOwed).toBe(200);
    });

    it('throws ConflictException when phone exists', async () => {
      supplierModel.findOne.mockReturnValue({
        lean: () => ({ exec: () => Promise.resolve({ phone: '01055556666' }) }),
      });

      await expect(service.create({ name: 'مورد', phone: '01055556666' }, actor)).rejects.toThrow(ConflictException);
    });
  });

  describe('findAll', () => {
    it('returns items, meta, and totalOwed summary', async () => {
      const result = await service.findAll({ hasDebt: true, page: 1, limit: 20 });

      expect(result.items).toHaveLength(1);
      expect(result.meta).toEqual({ page: 1, limit: 20, total: 1 });
      expect(result.summary.totalOwed).toBe(200);
    });
  });

  describe('softDelete', () => {
    it('blocks delete when amountOwed is non-zero', async () => {
      supplierModel.findOne.mockReturnValue({
        exec: () => Promise.resolve(makeSupplier({ amountOwed: 10 })),
      });

      await expect(service.softDelete(sourceId, actor)).rejects.toThrow(ConflictException);
    });

    it('soft deletes with supplier_deleted audit', async () => {
      const supplier = makeSupplier({ amountOwed: 0 });
      supplierModel.findOne.mockReturnValue({
        exec: () => Promise.resolve(supplier),
      });

      await service.softDelete(sourceId, actor);

      expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'supplier_deleted' }), session);
    });
  });

  describe('merge', () => {
    const sourceId2 = '507f1f77bcf86cd799439023';

    it('rejects when sourceIds include targetId', async () => {
      await expect(service.merge({ targetId: sourceId, sourceIds: [sourceId] }, actor)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('sums amountOwed from multiple sources onto target and soft-deletes sources', async () => {
      const source1 = makeSupplier({
        _id: { toString: () => sourceId },
        amountOwed: 30,
        name: 'مصدر 1',
      });
      const source2 = makeSupplier({
        _id: { toString: () => sourceId2 },
        amountOwed: 20,
        name: 'مصدر 2',
        phone: '01022222222',
      });
      const target = makeSupplier({
        _id: { toString: () => targetId },
        amountOwed: 70,
        name: 'هدف',
        phone: null,
      });

      supplierModel.findOne.mockReturnValue({
        exec: () => Promise.resolve(target),
      });
      supplierModel.find.mockReturnValue({
        exec: () => Promise.resolve([source1, source2]),
      });

      const result = await service.merge({ targetId, sourceIds: [sourceId, sourceId2] }, actor);

      expect(target.amountOwed).toBe(120);
      expect(source1.isDeleted).toBe(true);
      expect(source2.isDeleted).toBe(true);
      expect(source1.amountOwed).toBe(0);
      expect(source2.amountOwed).toBe(0);
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'supplier_merged',
          changes: expect.objectContaining({
            sourceIds: { old: null, new: ['مصدر 1', 'مصدر 2'] },
          }),
        }),
        session,
      );
      expect(purchaseInvoiceModel.updateMany).toHaveBeenCalledWith(
        { supplierId: { $in: [source1._id, source2._id] } },
        { $set: { supplierId: target._id } },
        { session },
      );
      expect(result.id).toBe(targetId);
    });

    it('throws NotFoundException when target missing', async () => {
      supplierModel.findOne.mockReturnValue({
        exec: () => Promise.resolve(null),
      });

      await expect(service.merge({ targetId, sourceIds: [sourceId] }, actor)).rejects.toThrow(NotFoundException);
    });
  });

  describe('actual balance accounting', () => {
    it('returns actual debt and invoice/payment totals without writing', async () => {
      const party = makeSupplier({ amountOwed: 30 });
      supplierModel.findOne.mockReturnValue({ exec: () => Promise.resolve(party) });
      purchaseInvoiceModel.aggregate.mockReturnValue({ exec: () => Promise.resolve([{ total: 100 }]) });
      paymentModel.aggregate.mockReturnValue({ exec: () => Promise.resolve([{ total: 20 }]) });
      expect(await service.findOne(sourceId)).toMatchObject({
        amountOwed: 30,
        financialSummary: { totalInvoiced: 100, totalPaid: 20 },
      });
      expect(party.save).not.toHaveBeenCalled();
    });

    it('sets current balance and audits adjustment and profile in one transaction', async () => {
      const party = makeSupplier({ amountOwed: 130 });
      supplierModel.findOne.mockReturnValue({ exec: () => Promise.resolve(party) });
      const oldName = party.name;
      const command = { amountOwed: -70, name: 'Corrected' };
      const result = await service.update(sourceId, command, actor);
      expect(result).toMatchObject({ amountOwed: -70, name: 'Corrected' });
      expect(supplierModel.findOne).toHaveBeenCalledWith({ _id: sourceId, isDeleted: false }, null, { session });
      expect(party.save).toHaveBeenCalledWith({ session });
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'supplier_edited',
          changes: expect.objectContaining({
            amountOwed: { old: 130, new: -70 },
            balanceAdjustment: { old: 0, new: -200 },
            name: { old: oldName, new: 'Corrected' },
          }),
        }),
        session,
      );
    });

    it('does not save or audit an unchanged balance', async () => {
      const party = makeSupplier({ amountOwed: 30 });
      supplierModel.findOne.mockReturnValue({ exec: () => Promise.resolve(party) });
      const command = { amountOwed: 30 };
      expect(await service.update(sourceId, command, actor)).toMatchObject({ amountOwed: 30 });
      expect(party.save).not.toHaveBeenCalled();
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it('keeps the current transaction balance during contact-only edits', async () => {
      const party = makeSupplier({ amountOwed: 300 });
      supplierModel.findOne.mockReturnValue({ exec: () => Promise.resolve(party) });
      expect(await service.update(sourceId, { address: 'New address' }, actor)).toMatchObject({ amountOwed: 300 });
      expect(supplierModel.findOne).toHaveBeenCalledWith({ _id: sourceId, isDeleted: false }, null, { session });
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ changes: { address: { old: undefined, new: 'New address' } } }),
        session,
      );
    });

    it('rejects precision loss before creating an account', async () => {
      await expect(service.create({ name: 'Party', amountOwed: 1.001 }, actor)).rejects.toThrow(BadRequestException);
      expect(supplierModel.create).not.toHaveBeenCalled();
    });
  });
});
