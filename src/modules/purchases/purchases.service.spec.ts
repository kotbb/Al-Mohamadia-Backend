import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { UserRole } from '../../shared/auth/enums/user-role.enum';
import { AuthUser } from '../../shared/auth/interfaces/auth-user.interface';
import { PricingMode } from '../../shared/enums/pricing-mode.enum';
import { PurchaseInvoiceStatus } from '../../shared/enums/purchase-invoice-status.enum';
import { SalesInvoicePeriod } from '../../shared/enums/sales-invoice-period.enum';
import { AuditService } from '../audit/audit.service';
import { Item } from '../items/schemas/item.schema';
import { InvoiceCounter } from '../sales-invoices/schemas/invoice-counter.schema';
import { Supplier } from '../suppliers/schemas/supplier.schema';
import { CreatePurchaseInvoiceDto } from './dto/request/create-purchase-invoice.dto';
import { ListPurchaseInvoicesQueryDto } from './dto/request/list-purchase-invoices-query.dto';
import { SupplierPayment } from '../supplier-payments/schemas/supplier-payment.schema';
import { PurchasesService } from './purchases.service';
import { PurchaseInvoice } from './schemas/purchase-invoice.schema';

describe('PurchasesService', () => {
  let service: PurchasesService;
  let purchaseInvoiceModel: {
    create: jest.Mock;
    findById: jest.Mock;
    find: jest.Mock;
    countDocuments: jest.Mock;
    aggregate: jest.Mock;
  };
  let invoiceCounterModel: {
    findOneAndUpdate: jest.Mock;
  };
  let supplierModel: {
    findOne: jest.Mock;
    findById: jest.Mock;
    find: jest.Mock;
  };
  let itemModel: {
    find: jest.Mock;
    updateOne: jest.Mock;
  };
  let auditService: { log: jest.Mock };
  let supplierPaymentModel: { aggregate: jest.Mock; create: jest.Mock; updateMany: jest.Mock; findOne: jest.Mock };
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

  const supplierId = '507f1f77bcf86cd799439011';
  const itemIdPiece = '507f1f77bcf86cd799439022';
  const itemIdCubic = '507f1f77bcf86cd799439033';
  const purchaseId = '507f1f77bcf86cd799439044';

  it('hydrates detail with a nullable supplier and unique referenced inactive items', async () => {
    const invoice = {
      _id: new Types.ObjectId(purchaseId),
      supplierId: new Types.ObjectId(supplierId),
      invoiceNumber: 'PUR-0042',
      lines: [
        { itemId: new Types.ObjectId(itemIdPiece), quantity: 1, unitCost: 10, lineTotal: 10 },
        { itemId: new Types.ObjectId(itemIdPiece), quantity: 1, unitCost: 10, lineTotal: 10 },
      ],
      total: 20,
      paid: 0,
      remaining: 20,
      status: PurchaseInvoiceStatus.SAVED,
      createdBy: new Types.ObjectId(actor.id),
      get: () => undefined,
    };
    purchaseInvoiceModel.findById.mockReturnValue(mockQuery(invoice));
    supplierModel.findOne.mockReturnValue(mockQuery(null));
    const item = makePieceItem({
      isActive: false,
      categoryId: { _id: itemIdPiece, name: 'Category' },
      get: () => undefined,
    });
    const populate = jest.fn().mockReturnValue(mockQuery([item]));
    itemModel.find.mockReturnValue({ populate });
    const result = await service.findOne(purchaseId);
    expect(result.supplier).toBeNull();
    expect(result.items).toMatchObject([{ id: itemIdPiece, isActive: false }]);
    expect(itemModel.find).toHaveBeenCalledWith({ _id: { $in: [new Types.ObjectId(itemIdPiece)] }, isDeleted: false });
    expect(populate).toHaveBeenCalledWith('categoryId', 'name createdAt');
    expect(purchaseInvoiceModel.aggregate).not.toHaveBeenCalled();
  });

  const makeSupplier = (overrides: Record<string, unknown> = {}) => ({
    _id: { toString: () => supplierId },
    name: 'المورد الحديث للخشب',
    phone: '01012345678',
    amountOwed: 10000,
    isActive: true,
    isDeleted: false,
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  });

  const makePieceItem = (overrides: Record<string, unknown> = {}) => ({
    _id: { toString: () => itemIdPiece },
    name: 'لوح خشب حبيبي',
    pricingMode: PricingMode.PER_PIECE,
    unitPrice: 150,
    cost: 100,
    stockQuantity: 50,
    isActive: true,
    isDeleted: false,
    ...overrides,
  });

  const makeCubicItem = (overrides: Record<string, unknown> = {}) => ({
    _id: { toString: () => itemIdCubic },
    name: 'خشب سويد',
    pricingMode: PricingMode.PER_CUBIC_METER,
    unitPrice: 12000,
    cost: 9000,
    stockQuantity: 10,
    isActive: true,
    isDeleted: false,
    ...overrides,
  });

  const mockQuery = <T>(val: T) => {
    const obj = {
      session: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(val),
    };
    return obj;
  };

  beforeEach(async () => {
    session = {
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      abortTransaction: jest.fn(),
      endSession: jest.fn(),
    };

    connection = {
      startSession: jest.fn().mockResolvedValue(session),
    };

    purchaseInvoiceModel = {
      create: jest.fn(),
      findById: jest.fn(),
      find: jest.fn(),
      countDocuments: jest.fn(),
      aggregate: jest.fn(),
    };

    invoiceCounterModel = {
      findOneAndUpdate: jest.fn().mockResolvedValue({ seq: 42 }),
    };

    supplierModel = {
      findOne: jest.fn(),
      findById: jest.fn(),
      find: jest.fn().mockReturnValue({
        select: () => ({ lean: () => ({ exec: () => Promise.resolve([{ _id: supplierId, name: 'Supplier' }]) }) }),
      }),
    };

    itemModel = {
      find: jest.fn(),
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    };

    auditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    supplierPaymentModel = {
      aggregate: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchasesService,
        { provide: getModelToken(PurchaseInvoice.name), useValue: purchaseInvoiceModel },
        { provide: getModelToken(InvoiceCounter.name), useValue: invoiceCounterModel },
        { provide: getModelToken(Supplier.name), useValue: supplierModel },
        { provide: getModelToken(Item.name), useValue: itemModel },
        { provide: getModelToken(SupplierPayment.name), useValue: supplierPaymentModel },
        { provide: getConnectionToken(), useValue: connection },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get<PurchasesService>(PurchasesService);
  });

  describe('create', () => {
    it('successfully creates a purchase invoice for per-piece items', async () => {
      const supplier = makeSupplier();
      const item = makePieceItem();

      supplierModel.findOne.mockReturnValue(mockQuery(supplier));
      itemModel.find.mockReturnValue(mockQuery([item]));

      const createdInvoice = {
        _id: { toString: () => purchaseId },
        invoiceNumber: 'PUR-0042',
        supplierId: { toString: () => supplierId },
        lines: [
          {
            itemId: { toString: () => itemIdPiece },
            quantity: 10,
            width: null,
            length: null,
            thickness: null,
            unitCost: 80,
            lineTotal: 800,
            note: null,
          },
        ],
        total: 800,
        paid: 300,
        remaining: 500,
        status: PurchaseInvoiceStatus.SAVED,
        notes: 'Delivery received',
        createdBy: { toString: () => actor.id },
        get: (key: string) => (key === 'createdAt' || key === 'updatedAt' ? new Date() : undefined),
      };

      purchaseInvoiceModel.create.mockResolvedValue([createdInvoice]);

      const dto: CreatePurchaseInvoiceDto = {
        supplierId,
        lines: [
          {
            itemId: itemIdPiece,
            quantity: 10,
            thickness: 0.018,
            width: 1.22,
            length: 2.44,
            unitCost: 80,
          },
        ],
        paid: 300,
        notes: 'Delivery received',
      };

      const result = await service.create(dto, actor);

      expect(purchaseInvoiceModel.create.mock.calls[0][0][0].lines[0]).toEqual(
        expect.objectContaining({
          thickness: 0.018,
          width: 1.22,
          length: 2.44,
          pricingModeSnapshot: PricingMode.PER_PIECE,
          lineTotal: 800,
        }),
      );
      expect(result.invoiceNumber).toBe('PUR-0042');
      expect(result.total).toBe(800);
      expect(result.paid).toBe(300);
      expect(result.remaining).toBe(500);
      expect(result.status).toBe(PurchaseInvoiceStatus.SAVED);

      // Verify stock incremented by +10
      expect(itemModel.updateOne).toHaveBeenCalledWith(
        { _id: itemIdPiece },
        { $inc: { stockQuantity: 10 } },
        { session },
      );

      // Verify supplier amountOwed incremented by remaining (+500): 10000 + 500 = 10500
      expect(supplier.amountOwed).toBe(10500);
      expect(supplier.save).toHaveBeenCalledWith({ session });

      // Verify audit log
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: actor.id,
          action: 'purchase_created',
          entityType: 'PurchaseInvoice',
          entityId: purchaseId,
        }),
        session,
      );

      expect(session.commitTransaction).toHaveBeenCalled();
    });

    it('successfully creates a purchase invoice for per_cubic_meter items', async () => {
      const supplier = makeSupplier();
      const item = makeCubicItem();

      supplierModel.findOne.mockReturnValue(mockQuery(supplier));
      itemModel.find.mockReturnValue(mockQuery([item]));

      // 5cm x 10cm x 400cm = 200,000 / 1,000,000 = 0.2 m³
      // 10 pieces x 0.2 m³ = 2 m³
      // 2 m³ x 8000 = 16000 EGP
      // wait: 5 * 10 * 400 = 20,000! 20,000 / 1,000,000 = 0.02 m³
      // 10 pieces * 0.02 m³ = 0.2 m³
      // 0.2 m³ * 8000 = 1600 EGP
      const createdInvoice = {
        _id: { toString: () => purchaseId },
        invoiceNumber: 'PUR-0042',
        supplierId: { toString: () => supplierId },
        lines: [
          {
            itemId: { toString: () => itemIdCubic },
            quantity: 10,
            width: 0.1,
            length: 4,
            thickness: 0.05,
            unitCost: 8000,
            lineTotal: 1600,
            note: null,
          },
        ],
        total: 1600,
        paid: 1600,
        remaining: 0,
        status: PurchaseInvoiceStatus.SAVED,
        notes: null,
        createdBy: { toString: () => actor.id },
        get: (key: string) => (key === 'createdAt' || key === 'updatedAt' ? new Date() : undefined),
      };

      purchaseInvoiceModel.create.mockResolvedValue([createdInvoice]);

      const dto: CreatePurchaseInvoiceDto = {
        supplierId,
        lines: [
          {
            itemId: itemIdCubic,
            quantity: 10,
            unitCost: 8000,
            thickness: 0.05,
            width: 0.1,
            length: 4,
          },
        ],
        paid: 1600,
      };

      const result = await service.create(dto, actor);

      expect(result.total).toBe(1600);
      expect(result.remaining).toBe(0);

      // Verify stock incremented by 0.2 m³
      expect(itemModel.updateOne).toHaveBeenCalledWith(
        { _id: itemIdCubic },
        { $inc: { stockQuantity: 0.2 } },
        { session },
      );

      // Paid in full: remaining is 0, so supplier amountOwed remains unchanged
      expect(supplier.amountOwed).toBe(10000);
    });

    it('records excess payment against prior supplier debt in the same transaction', async () => {
      const supplier = makeSupplier({ amountOwed: 9983 });
      supplierModel.findOne.mockReturnValue(mockQuery(supplier));
      itemModel.find.mockReturnValue(mockQuery([makePieceItem()]));
      purchaseInvoiceModel.create.mockResolvedValue([
        {
          _id: { toString: () => purchaseId },
          invoiceNumber: 'PUR-0042',
          supplierId: { toString: () => supplierId },
          lines: [
            {
              itemId: { toString: () => itemIdPiece },
              quantity: 2,
              width: null,
              length: null,
              thickness: null,
              unitCost: 380,
              lineTotal: 760,
              note: null,
            },
          ],
          total: 760,
          paid: 760,
          remaining: 0,
          status: PurchaseInvoiceStatus.SAVED,
          notes: null,
          createdBy: { toString: () => actor.id },
          get: () => new Date(),
        },
      ]);
      supplierPaymentModel.create.mockImplementation((payments) =>
        payments.map((payment: { amount: number; purchaseInvoiceId: unknown }) => ({
          ...payment,
          _id: { toString: () => purchaseId },
          method: 'cash',
        })),
      );

      const result = await service.create(
        {
          supplierId,
          lines: [{ itemId: itemIdPiece, quantity: 2, unitCost: 380 }],
          paid: 760,
          accountPaymentAmount: 10083,
        },
        actor,
      );

      expect(result.paid).toBe(760);
      expect(result.remaining).toBe(0);
      expect(supplier.amountOwed).toBe(-100);
      expect(supplierPaymentModel.create).toHaveBeenCalledTimes(2);
      expect(supplierPaymentModel.create).toHaveBeenNthCalledWith(
        2,
        [expect.objectContaining({ amount: 10083, purchaseInvoiceId: null })],
        { session },
      );
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'supplier_payment_recorded' }),
        session,
      );
      expect(session.commitTransaction).toHaveBeenCalled();
    });

    it('rejects supplying both account payment aliases', async () => {
      supplierModel.findOne.mockReturnValue(mockQuery(makeSupplier()));
      itemModel.find.mockReturnValue(mockQuery([makePieceItem()]));
      await expect(
        service.create(
          {
            supplierId,
            lines: [{ itemId: itemIdPiece, quantity: 1, unitCost: 100 }],
            paid: 100,
            existingDebtPayment: 0,
            accountPaymentAmount: 1,
          },
          actor,
        ),
      ).rejects.toThrow('not both');
      expect(purchaseInvoiceModel.create).not.toHaveBeenCalled();
    });

    it('fails if no lines are provided', async () => {
      const dto = { supplierId, lines: [] } as any;
      await expect(service.create(dto, actor)).rejects.toThrow(BadRequestException);
    });

    it('fails if supplier is not found', async () => {
      supplierModel.findOne.mockReturnValue(mockQuery(null));
      const dto: CreatePurchaseInvoiceDto = {
        supplierId,
        lines: [{ itemId: itemIdPiece, quantity: 1, unitCost: 10 }],
      };

      await expect(service.create(dto, actor)).rejects.toThrow(NotFoundException);
    });

    it('fails if supplier is inactive', async () => {
      supplierModel.findOne.mockReturnValue(mockQuery(makeSupplier({ isActive: false })));
      const dto: CreatePurchaseInvoiceDto = {
        supplierId,
        lines: [{ itemId: itemIdPiece, quantity: 1, unitCost: 10 }],
      };

      await expect(service.create(dto, actor)).rejects.toThrow(BadRequestException);
    });

    it('fails if item is not found', async () => {
      supplierModel.findOne.mockReturnValue(mockQuery(makeSupplier()));
      itemModel.find.mockReturnValue(mockQuery([]));

      const dto: CreatePurchaseInvoiceDto = {
        supplierId,
        lines: [{ itemId: itemIdPiece, quantity: 1, unitCost: 10 }],
      };

      await expect(service.create(dto, actor)).rejects.toThrow(NotFoundException);
    });

    it('fails if item is inactive', async () => {
      supplierModel.findOne.mockReturnValue(mockQuery(makeSupplier()));
      itemModel.find.mockReturnValue(mockQuery([makePieceItem({ isActive: false })]));

      const dto: CreatePurchaseInvoiceDto = {
        supplierId,
        lines: [{ itemId: itemIdPiece, quantity: 1, unitCost: 10 }],
      };

      await expect(service.create(dto, actor)).rejects.toThrow(BadRequestException);
    });

    it('creates canonical free-amount lines without writing stock', async () => {
      supplierModel.findOne.mockReturnValue(mockQuery(makeSupplier()));
      itemModel.find.mockReturnValue(mockQuery([makePieceItem({ pricingMode: PricingMode.FREE_AMOUNT })]));
      purchaseInvoiceModel.create.mockImplementation((rows: Record<string, unknown>[]) => [
        {
          ...rows[0],
          _id: purchaseId,
          get: () => undefined,
        },
      ]);
      const result = await service.create(
        { supplierId, lines: [{ itemId: itemIdPiece, quantity: 1, unitCost: 10.25 }] },
        actor,
      );
      expect(result.lines[0]).toMatchObject({
        quantity: 1,
        unitCost: 10.25,
        lineTotal: 10.25,
        pricingModeSnapshot: PricingMode.FREE_AMOUNT,
        width: null,
        length: null,
        thickness: null,
      });
      expect(itemModel.updateOne).not.toHaveBeenCalled();
      expect(session.commitTransaction).toHaveBeenCalled();
    });

    it.each([{ quantity: 2 }, { width: 1 }, { unitCost: 1.234 }, { unitCost: NaN }, { unitCost: 0 }])(
      'rejects invalid free-amount lines %j',
      async (overrides) => {
        supplierModel.findOne.mockReturnValue(mockQuery(makeSupplier()));
        itemModel.find.mockReturnValue(mockQuery([makePieceItem({ pricingMode: PricingMode.FREE_AMOUNT })]));
        await expect(
          service.create(
            { supplierId, lines: [{ itemId: itemIdPiece, quantity: 1, unitCost: 10, ...overrides }] },
            actor,
          ),
        ).rejects.toThrow(BadRequestException);
        expect(purchaseInvoiceModel.create).not.toHaveBeenCalled();
      },
    );

    it('fails if cubic-meter item is missing dimensions', async () => {
      supplierModel.findOne.mockReturnValue(mockQuery(makeSupplier()));
      itemModel.find.mockReturnValue(mockQuery([makeCubicItem()]));

      const dto: CreatePurchaseInvoiceDto = {
        supplierId,
        lines: [{ itemId: itemIdCubic, quantity: 1, unitCost: 1000 }],
      };

      await expect(service.create(dto, actor)).rejects.toThrow(BadRequestException);
    });

    it('fails if paid amount exceeds total', async () => {
      supplierModel.findOne.mockReturnValue(mockQuery(makeSupplier()));
      itemModel.find.mockReturnValue(mockQuery([makePieceItem()]));

      const dto: CreatePurchaseInvoiceDto = {
        supplierId,
        lines: [{ itemId: itemIdPiece, quantity: 10, unitCost: 100 }], // total = 1000
        paid: 1500,
      };

      await expect(service.create(dto, actor)).rejects.toThrow(BadRequestException);
    });

    it('fails if paid amount is negative', async () => {
      supplierModel.findOne.mockReturnValue(mockQuery(makeSupplier()));
      itemModel.find.mockReturnValue(mockQuery([makePieceItem()]));

      const dto: CreatePurchaseInvoiceDto = {
        supplierId,
        lines: [{ itemId: itemIdPiece, quantity: 10, unitCost: 100 }],
        paid: -50,
      };

      await expect(service.create(dto, actor)).rejects.toThrow(BadRequestException);
    });
  });

  describe('update', () => {
    it.each([0, 700])(
      'moves invoice debt and creates only a newly requested account payment of %s',
      async (accountPaymentAmount) => {
        const nextSupplierId = '507f1f77bcf86cd799439055';
        const oldSupplier = makeSupplier({ amountOwed: 700 });
        const newSupplier = makeSupplier({ _id: { toString: () => nextSupplierId }, amountOwed: 80, isActive: true });
        const invoice = {
          _id: { toString: () => purchaseId },
          invoiceNumber: 'PUR-0042',
          supplierId: { toString: () => supplierId },
          lines: [
            {
              itemId: { toString: () => itemIdPiece },
              quantity: 2,
              pricingModeSnapshot: PricingMode.PER_PIECE,
              width: null,
              length: null,
              thickness: null,
              unitCost: 100,
              lineTotal: 200,
              note: null,
            },
          ],
          total: 200,
          paid: 50,
          remaining: 150,
          status: PurchaseInvoiceStatus.SAVED,
          notes: null,
          createdBy: { toString: () => actor.id },
          save: jest.fn().mockResolvedValue(undefined),
          get: () => new Date(),
        };
        const linkedPayment = {
          amount: 50,
          supplierId: invoice.supplierId,
          notes: null,
          save: jest.fn().mockResolvedValue(undefined),
        };
        purchaseInvoiceModel.findById.mockReturnValue(mockQuery(invoice));
        supplierModel.findOne.mockReturnValue(mockQuery(newSupplier));
        supplierModel.findById.mockImplementation((id: string) =>
          mockQuery(id === supplierId ? oldSupplier : newSupplier),
        );
        itemModel.find.mockReturnValue(mockQuery([makePieceItem({ isActive: false })]));
        supplierPaymentModel.findOne.mockReturnValue(mockQuery(linkedPayment));

        supplierPaymentModel.create.mockResolvedValue([{ _id: { toString: () => purchaseId }, method: 'cash' }]);
        const result = await service.update(
          purchaseId,
          {
            supplierId: nextSupplierId,
            lines: [{ itemId: itemIdPiece, quantity: 3, unitCost: 100 }],
            paid: 100,
            notes: 'Edited',
            accountPaymentAmount,
          },
          actor,
        );

        expect(result.remaining).toBe(200);
        expect(oldSupplier.amountOwed).toBe(550);
        expect(newSupplier.amountOwed).toBe(280 - accountPaymentAmount);
        expect(supplierPaymentModel.create).toHaveBeenCalledTimes(accountPaymentAmount > 0 ? 1 : 0);
        expect(linkedPayment.amount).toBe(100);
        expect(linkedPayment.supplierId.toString()).toBe(nextSupplierId);
        expect(itemModel.updateOne).toHaveBeenCalledTimes(2);
        expect(supplierPaymentModel.updateMany).not.toHaveBeenCalled();
        expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'purchase_updated' }), session);
        expect(session.commitTransaction).toHaveBeenCalled();
      },
    );

    it('rejects editing a cancelled invoice', async () => {
      purchaseInvoiceModel.findById.mockReturnValue(mockQuery({ status: PurchaseInvoiceStatus.CANCELLED }));
      await expect(
        service.update(
          purchaseId,
          {
            supplierId,
            lines: [{ itemId: itemIdPiece, quantity: 1, unitCost: 100 }],
            paid: 0,
          },
          actor,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('uses the current cubic mode, adjusts the same supplier by the debt delta, and reverses a zeroed linked payment', async () => {
      const supplier = makeSupplier({ amountOwed: 700, isActive: false });
      const invoice = {
        _id: { toString: () => purchaseId },
        invoiceNumber: 'PUR-0042',
        supplierId: { toString: () => supplierId },
        lines: [
          {
            itemId: { toString: () => itemIdPiece },
            quantity: 2,
            pricingModeSnapshot: PricingMode.PER_PIECE,
            width: 0.1,
            length: 1,
            thickness: 0.1,
            unitCost: 100,
            lineTotal: 200,
            note: null,
          },
        ],
        total: 200,
        paid: 50,
        remaining: 150,
        status: PurchaseInvoiceStatus.SAVED,
        notes: null,
        createdBy: { toString: () => actor.id },
        save: jest.fn().mockResolvedValue(undefined),
        get: () => new Date(),
      };
      const payment = {
        amount: 50,
        reversedAt: null as Date | null,
        reversedBy: null,
        save: jest.fn().mockResolvedValue(undefined),
      };
      purchaseInvoiceModel.findById.mockReturnValue(mockQuery(invoice));
      supplierModel.findOne.mockReturnValue(mockQuery(supplier));
      supplierModel.findById.mockReturnValue(mockQuery(supplier));
      itemModel.find.mockReturnValue(
        mockQuery([makePieceItem({ isActive: false, pricingMode: PricingMode.PER_CUBIC_METER })]),
      );
      supplierPaymentModel.findOne.mockReturnValue(mockQuery(payment));

      const result = await service.update(
        purchaseId,
        {
          supplierId,
          lines: [{ itemId: itemIdPiece, quantity: 3, unitCost: 1000, thickness: 0.1, width: 0.1, length: 1 }],
          paid: 0,
        },
        actor,
      );

      expect(result.total).toBe(30);
      expect(result.remaining).toBe(30);
      expect(supplier.amountOwed).toBe(580);
      expect(itemModel.updateOne).toHaveBeenCalledWith(
        { _id: itemIdPiece },
        { $inc: { stockQuantity: 0.03 } },
        { session },
      );
      expect(payment.reversedAt).toBeInstanceOf(Date);
      expect(session.commitTransaction).toHaveBeenCalled();
    });

    it('rejects an inactive supplier or item newly selected on edit', async () => {
      const invoice = {
        status: PurchaseInvoiceStatus.SAVED,
        supplierId: { toString: () => supplierId },
        lines: [{ itemId: { toString: () => itemIdPiece } }],
      };
      purchaseInvoiceModel.findById.mockReturnValue(mockQuery(invoice));
      itemModel.find.mockReturnValue(mockQuery([makeCubicItem({ isActive: false })]));
      await expect(
        service.update(
          purchaseId,
          {
            supplierId,
            lines: [{ itemId: itemIdCubic, quantity: 1, unitCost: 100, thickness: 1, width: 1, length: 1 }],
            paid: 0,
          },
          actor,
        ),
      ).rejects.toThrow('Item is inactive');
      itemModel.find.mockReturnValue(mockQuery([makePieceItem()]));
      supplierModel.findOne.mockReturnValue(
        mockQuery(makeSupplier({ _id: { toString: () => '507f1f77bcf86cd799439055' }, isActive: false })),
      );
      await expect(
        service.update(
          purchaseId,
          {
            supplierId: '507f1f77bcf86cd799439055',
            lines: [{ itemId: itemIdPiece, quantity: 1, unitCost: 100 }],
            paid: 0,
          },
          actor,
        ),
      ).rejects.toThrow('Supplier is inactive');
    });
  });

  describe('cancel', () => {
    it('successfully cancels a saved purchase invoice and reverses stock and debt', async () => {
      const supplier = makeSupplier({ amountOwed: 5000 });
      const item = makePieceItem();

      const invoice = {
        _id: { toString: () => purchaseId },
        invoiceNumber: 'PUR-0042',
        supplierId: { toString: () => supplierId },
        lines: [
          {
            itemId: { toString: () => itemIdPiece },
            quantity: 10,
            width: null,
            length: null,
            thickness: null,
            unitCost: 100,
            lineTotal: 1000,
            note: null,
          },
        ],
        total: 1000,
        paid: 400,
        remaining: 600,
        status: PurchaseInvoiceStatus.SAVED,
        notes: null,
        createdBy: { toString: () => actor.id },
        save: jest.fn().mockResolvedValue(undefined),
        get: (key: string) => (key === 'createdAt' || key === 'updatedAt' ? new Date() : undefined),
      };

      purchaseInvoiceModel.findById.mockReturnValue(mockQuery(invoice));
      itemModel.find.mockReturnValue(mockQuery([item]));
      supplierModel.findById.mockReturnValue(mockQuery(supplier));

      const result = await service.cancel(purchaseId, actor);

      expect(result.status).toBe(PurchaseInvoiceStatus.CANCELLED);

      // Reverses stock: -10
      expect(itemModel.updateOne).toHaveBeenCalledWith(
        { _id: { toString: expect.any(Function) } },
        { $inc: { stockQuantity: -10 } },
        { session },
      );

      // Reverses debt: amountOwed was 5000, remaining was 600 -> 5000 - 600 = 4400
      expect(supplier.amountOwed).toBe(4400);
      expect(supplier.save).toHaveBeenCalledWith({ session });

      // Audit logged
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: actor.id,
          action: 'purchase_cancelled',
          entityType: 'PurchaseInvoice',
          entityId: purchaseId,
        }),
        session,
      );

      expect(session.commitTransaction).toHaveBeenCalled();
    });

    it('reverses dimension-bearing piece stock using snapshot after item pricing changes', async () => {
      const supplier = makeSupplier({ amountOwed: 5000 });
      const item = makePieceItem({ pricingMode: PricingMode.PER_CUBIC_METER });

      const invoice = {
        _id: { toString: () => purchaseId },
        invoiceNumber: 'PUR-0042',
        supplierId: { toString: () => supplierId },
        lines: [
          {
            itemId: { toString: () => itemIdPiece },
            quantity: 10,
            width: 1.22,
            length: 2.44,
            thickness: 0.018,
            pricingModeSnapshot: PricingMode.PER_PIECE,
            unitCost: 100,
            lineTotal: 1000,
            note: null,
          },
        ],
        total: 1000,
        paid: 400,
        remaining: 600,
        status: PurchaseInvoiceStatus.SAVED,
        notes: null,
        createdBy: { toString: () => actor.id },
        save: jest.fn().mockResolvedValue(undefined),
        get: (key: string) => (key === 'createdAt' || key === 'updatedAt' ? new Date() : undefined),
      };

      purchaseInvoiceModel.findById.mockReturnValue(mockQuery(invoice));
      itemModel.find.mockReturnValue(mockQuery([item]));
      supplierModel.findById.mockReturnValue(mockQuery(supplier));

      const result = await service.cancel(purchaseId, actor);

      expect(result.status).toBe(PurchaseInvoiceStatus.CANCELLED);

      // Reverses stock: -10
      expect(itemModel.updateOne).toHaveBeenCalledWith(
        { _id: { toString: expect.any(Function) } },
        { $inc: { stockQuantity: -10 } },
        { session },
      );

      // Reverses debt: amountOwed was 5000, remaining was 600 -> 5000 - 600 = 4400
      expect(supplier.amountOwed).toBe(4400);
      expect(supplier.save).toHaveBeenCalledWith({ session });

      // Audit logged
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: actor.id,
          action: 'purchase_cancelled',
          entityType: 'PurchaseInvoice',
          entityId: purchaseId,
        }),
        session,
      );

      expect(session.commitTransaction).toHaveBeenCalled();
    });

    it('fails if invoice is already cancelled', async () => {
      const invoice = {
        _id: { toString: () => purchaseId },
        status: PurchaseInvoiceStatus.CANCELLED,
      };
      purchaseInvoiceModel.findById.mockReturnValue(mockQuery(invoice));

      await expect(service.cancel(purchaseId, actor)).rejects.toThrow(BadRequestException);
    });

    it('fails if invoice is not found', async () => {
      purchaseInvoiceModel.findById.mockReturnValue(mockQuery(null));

      await expect(service.cancel(purchaseId, actor)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('lists invoices with pagination and active summary', async () => {
      const invoiceDoc = {
        _id: { toString: () => purchaseId },
        invoiceNumber: 'PUR-0042',
        supplierId: { toString: () => supplierId },
        lines: [],
        total: 1000,
        paid: 400,
        remaining: 600,
        status: PurchaseInvoiceStatus.SAVED,
        notes: null,
        createdBy: { toString: () => actor.id },
        get: () => new Date(),
      };

      purchaseInvoiceModel.find.mockReturnValue(mockQuery([invoiceDoc]));
      purchaseInvoiceModel.countDocuments.mockReturnValue(mockQuery(1));
      purchaseInvoiceModel.aggregate.mockResolvedValue([{ totalAmount: 1000 }]);

      const query: ListPurchaseInvoicesQueryDto = {
        page: 1,
        limit: 20,
      };

      const result = await service.findAll(query);

      expect(result.items.length).toBe(1);
      expect(result.meta.total).toBe(1);
      expect(result.summary.totalAmount).toBe(1000);
      expect(result.items[0].supplierName).toBe('Supplier');
    });

    it('searches by q across invoice number and supplier name/phone', async () => {
      const matchingSupplier = makeSupplier();
      supplierModel.find = jest.fn().mockReturnValue({
        select: () => ({
          lean: () => ({
            exec: () => Promise.resolve([matchingSupplier]),
          }),
        }),
      });

      purchaseInvoiceModel.find.mockReturnValue(mockQuery([]));
      purchaseInvoiceModel.countDocuments.mockReturnValue(mockQuery(0));
      purchaseInvoiceModel.aggregate.mockResolvedValue([]);

      const result = await service.findAll({ q: '0042' });

      expect(supplierModel.find).toHaveBeenCalled();
      expect(result.items).toEqual([]);
    });

    it('fails if period is given without date', async () => {
      const query: ListPurchaseInvoicesQueryDto = {
        period: SalesInvoicePeriod.DAY,
      };

      await expect(service.findAll(query)).rejects.toThrow(BadRequestException);
    });

    it('fails if date is given without period', async () => {
      const query: ListPurchaseInvoicesQueryDto = {
        date: '2026-09-18',
      };

      await expect(service.findAll(query)).rejects.toThrow(BadRequestException);
    });
  });
});
