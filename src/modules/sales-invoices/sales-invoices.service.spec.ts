import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { SalesInvoicesService } from './sales-invoices.service';
import { SalesInvoice } from './schemas/sales-invoice.schema';
import { Payment } from '../payments/schemas/payment.schema';
import { InvoiceCounter } from './schemas/invoice-counter.schema';
import { Customer } from '../customers/schemas/customer.schema';
import { Item } from '../items/schemas/item.schema';
import { AuditService } from '../audit/audit.service';
import { UserRole } from '../../shared/auth/enums/user-role.enum';
import { AuthUser } from '../../shared/auth/interfaces/auth-user.interface';
import { PaymentMethod } from '../../shared/enums/payment-method.enum';
import { PricingMode } from '../../shared/enums/pricing-mode.enum';
import { SalesInvoiceStatus } from '../../shared/enums/sales-invoice-status.enum';
import { SalesInvoiceType } from '../../shared/enums/sales-invoice-type.enum';
describe('SalesInvoicesService', () => {
  let service: SalesInvoicesService;
  let salesInvoiceModel: {
    create: jest.Mock;
    find: jest.Mock;
    findById: jest.Mock;
    findOne: jest.Mock;
    countDocuments: jest.Mock;
  };
  let paymentModel: { create: jest.Mock; updateMany: jest.Mock; findOne: jest.Mock };
  let invoiceCounterModel: { findOneAndUpdate: jest.Mock };
  let customerModel: { findOne: jest.Mock; findById: jest.Mock; find: jest.Mock };
  let itemModel: { find: jest.Mock; findById: jest.Mock; updateOne: jest.Mock };
  let auditService: { log: jest.Mock };
  let connection: { startSession: jest.Mock };
  let configService: { get: jest.Mock };
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

  const itemId = '507f1f77bcf86cd799439001';
  const cubicItemId = '507f1f77bcf86cd799439002';
  const customerId = '507f1f77bcf86cd799439003';
  const invoiceId = '507f1f77bcf86cd799439004';

  const makeItem = (overrides: Record<string, unknown> = {}) => ({
    _id: { toString: () => itemId },
    code: 'MDF-18',
    name: 'لوح MDF',
    pricingMode: PricingMode.PER_PIECE,
    unitPrice: 450,
    cost: 380,
    stockQuantity: 48,
    isActive: true,
    isDeleted: false,
    ...overrides,
  });

  const makeCustomer = (overrides: Record<string, unknown> = {}) => ({
    _id: { toString: () => customerId },
    name: 'أحمد',
    phone: '01012345678',
    balance: 100,
    isActive: true,
    isDeleted: false,
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  });

  const makeInvoice = (overrides: Record<string, unknown> = {}) => ({
    _id: { toString: () => invoiceId },
    invoiceNumber: 'INV-0001',
    type: SalesInvoiceType.CUSTOMER_SALE,
    customerId: { toString: () => customerId },
    lines: [
      {
        itemId: { toString: () => itemId },
        quantity: 2,
        width: null,
        length: null,
        thickness: null,
        piecePrice: 450,
        costPriceSnapshot: 380,
        lineTotal: 900,
        note: null,
      },
    ],
    total: 900,
    discount: 0,
    paid: 400,
    remaining: 500,
    status: SalesInvoiceStatus.SAVED,
    createdBy: { toString: () => actor.id },
    pdfShareToken: null,
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

    salesInvoiceModel = {
      create: jest.fn().mockResolvedValue([makeInvoice()]),
      find: jest.fn().mockReturnValue({
        sort: () => ({
          skip: () => ({
            limit: () => ({
              exec: () => Promise.resolve([makeInvoice()]),
            }),
          }),
        }),
      }),
      findById: jest.fn().mockReturnValue({
        exec: () => Promise.resolve(makeInvoice()),
      }),
      findOne: jest.fn().mockReturnValue({
        exec: () => Promise.resolve(makeInvoice({ pdfShareToken: 'abc' })),
      }),
      countDocuments: jest.fn().mockReturnValue({ exec: () => Promise.resolve(1) }),
    };

    paymentModel = {
      create: jest.fn().mockResolvedValue([{}]),
      updateMany: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
      findOne: jest.fn().mockReturnValue({
        session: () => ({
          exec: () => Promise.resolve(null),
        }),
      }),
    };

    invoiceCounterModel = {
      findOneAndUpdate: jest.fn().mockResolvedValue({ seq: 1 }),
    };

    customerModel = {
      findOne: jest.fn().mockReturnValue({
        exec: () => Promise.resolve(makeCustomer()),
      }),
      findById: jest.fn().mockImplementation(() => ({
        session: () => ({
          exec: () => Promise.resolve(makeCustomer()),
        }),
        exec: () => Promise.resolve(makeCustomer()),
      })),
      find: jest.fn().mockReturnValue({
        select: () => ({
          lean: () => ({
            exec: () => Promise.resolve([]),
          }),
        }),
      }),
    };

    itemModel = {
      find: jest.fn().mockReturnValue({
        exec: () => Promise.resolve([makeItem()]),
        session: () => ({
          exec: () => Promise.resolve([makeItem()]),
        }),
      }),
      findById: jest.fn().mockReturnValue({
        session: () => ({
          exec: () => Promise.resolve(makeItem()),
        }),
      }),
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    };

    auditService = { log: jest.fn().mockResolvedValue({}) };
    connection = { startSession: jest.fn().mockResolvedValue(session) };
    configService = {
      get: jest.fn().mockReturnValue('http://localhost:3000'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesInvoicesService,
        { provide: getModelToken(SalesInvoice.name), useValue: salesInvoiceModel },
        { provide: getModelToken(Payment.name), useValue: paymentModel },
        { provide: getModelToken(InvoiceCounter.name), useValue: invoiceCounterModel },
        { provide: getModelToken(Customer.name), useValue: customerModel },
        { provide: getModelToken(Item.name), useValue: itemModel },
        { provide: getConnectionToken(), useValue: connection },
        { provide: AuditService, useValue: auditService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get(SalesInvoicesService);
    jest.clearAllMocks();
    connection.startSession.mockResolvedValue(session);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('creates cash sale fully paid, deducts stock, creates payment, no balance change', async () => {
      salesInvoiceModel.create.mockResolvedValue([
        makeInvoice({
          type: SalesInvoiceType.CASH_SALE,
          customerId: null,
          paid: 900,
          remaining: 0,
        }),
      ]);

      const result = await service.create(
        {
          type: SalesInvoiceType.CASH_SALE,
          lines: [{ itemId, quantity: 2, piecePrice: 450 }],
          paid: 900,
        },
        actor,
      );

      expect(itemModel.updateOne).toHaveBeenCalledWith({ _id: itemId }, { $inc: { stockQuantity: -2 } }, { session });
      expect(paymentModel.create).toHaveBeenCalled();
      expect(customerModel.findOne).not.toHaveBeenCalled();
      expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'invoice_created' }), session);
      expect(result.remaining).toBe(0);
    });

    it('stores descriptive piece dimensions and server pricing mode without changing totals or stock', async () => {
      await service.create(
        {
          type: SalesInvoiceType.CASH_SALE,
          lines: [{ itemId, quantity: 2, piecePrice: 450, thickness: 0.018, width: 1.22, length: 2.44 }],
          paid: 900,
        },
        actor,
      );
      expect(salesInvoiceModel.create.mock.calls[0][0][0].lines[0]).toEqual(
        expect.objectContaining({
          thickness: 0.018,
          width: 1.22,
          length: 2.44,
          lineTotal: 900,
          pricingModeSnapshot: PricingMode.PER_PIECE,
        }),
      );
      expect(itemModel.updateOne).toHaveBeenCalledWith({ _id: itemId }, { $inc: { stockQuantity: -2 } }, { session });
    });

    it('rejects nonpositive optional piece dimensions', async () => {
      await expect(
        service.create(
          {
            type: SalesInvoiceType.CASH_SALE,
            lines: [{ itemId, quantity: 2, piecePrice: 450, thickness: 0 }],
            paid: 900,
          },
          actor,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects cash underpayment', async () => {
      await expect(
        service.create(
          {
            type: SalesInvoiceType.CASH_SALE,
            lines: [{ itemId, quantity: 2, piecePrice: 450 }],
            paid: 800,
          },
          actor,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('customer sale adds only remaining to balance and records payment', async () => {
      const customer = makeCustomer({ balance: 100 });
      customerModel.findOne.mockReturnValue({
        exec: () => Promise.resolve(customer),
      });
      salesInvoiceModel.create.mockResolvedValue([makeInvoice({ paid: 400, remaining: 500 })]);

      await service.create(
        {
          type: SalesInvoiceType.CUSTOMER_SALE,
          customerId,
          lines: [{ itemId, quantity: 2, piecePrice: 450 }],
          paid: 400,
        },
        actor,
      );

      expect(customer.balance).toBe(600);
      expect(customer.save).toHaveBeenCalledWith({ session });
      expect(paymentModel.create).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            amount: 400,
            invoiceId: expect.anything(),
          }),
        ],
        { session },
      );
    });

    it('computes cubic line stock and total', async () => {
      const cubicItem = makeItem({
        _id: { toString: () => cubicItemId },
        code: 'WOOD-BALADI',
        pricingMode: PricingMode.PER_CUBIC_METER,
        unitPrice: 850,
        cost: 720,
      });
      itemModel.find.mockReturnValue({
        exec: () => Promise.resolve([cubicItem]),
      });
      salesInvoiceModel.create.mockResolvedValue([
        makeInvoice({
          type: SalesInvoiceType.CASH_SALE,
          customerId: null,
          total: 17,
          paid: 17,
          remaining: 0,
          lines: [],
        }),
      ]);

      await service.create(
        {
          type: SalesInvoiceType.CASH_SALE,
          lines: [
            {
              itemId: cubicItemId,
              quantity: 2,
              piecePrice: 850,
              thickness: 0.02,
              width: 0.5,
              length: 1,
            },
          ],
          paid: 17,
        },
        actor,
      );

      expect(itemModel.updateOne).toHaveBeenCalledWith(
        { _id: cubicItemId },
        { $inc: { stockQuantity: -0.02 } },
        { session },
      );
      expect(salesInvoiceModel.create).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            total: 17,
            paid: 17,
            remaining: 0,
          }),
        ],
        { session },
      );
    });

    it('rejects inactive item and empty lines', async () => {
      itemModel.find.mockReturnValue({
        exec: () => Promise.resolve([makeItem({ isActive: false })]),
      });

      await expect(
        service.create(
          {
            type: SalesInvoiceType.CASH_SALE,
            lines: [{ itemId, quantity: 1, piecePrice: 450 }],
            paid: 450,
          },
          actor,
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.create(
          {
            type: SalesInvoiceType.CASH_SALE,
            lines: [],
            paid: 0,
          },
          actor,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects discount greater than total', async () => {
      await expect(
        service.create(
          {
            type: SalesInvoiceType.CASH_SALE,
            lines: [{ itemId, quantity: 1, piecePrice: 100 }],
            discount: 150,
            paid: 0,
          },
          actor,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('cancel', () => {
    it('restores stock, reverses balance, voids payments', async () => {
      const customer = makeCustomer({ balance: 600 });
      const invoice = makeInvoice();
      salesInvoiceModel.findById.mockReturnValue({
        exec: () => Promise.resolve(invoice),
      });
      customerModel.findById.mockReturnValue({
        session: () => ({
          exec: () => Promise.resolve(customer),
        }),
      });
      itemModel.find.mockReturnValue({
        session: () => ({
          exec: () => Promise.resolve([makeItem()]),
        }),
      });

      const result = await service.cancel(invoiceId, actor);

      expect(itemModel.updateOne).toHaveBeenCalledWith(
        { _id: expect.anything() },
        { $inc: { stockQuantity: 2 } },
        { session },
      );
      expect(customer.balance).toBe(100);
      expect(paymentModel.updateMany).toHaveBeenCalledWith(
        { invoiceId: invoice._id, reversedAt: null },
        expect.objectContaining({
          $set: expect.objectContaining({
            reversedAt: expect.any(Date),
          }),
        }),
        { session },
      );
      expect(result.status).toBe(SalesInvoiceStatus.CANCELLED);
      expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'invoice_cancelled' }), session);
    });

    it('uses saved piece pricing for reversal after item pricing mode changes', async () => {
      const invoice = makeInvoice();
      Object.assign(invoice.lines[0], {
        thickness: 0.018,
        width: 1.22,
        length: 2.44,
        pricingModeSnapshot: PricingMode.PER_PIECE,
      });
      salesInvoiceModel.findById.mockReturnValue({ exec: () => Promise.resolve(invoice) });
      itemModel.find.mockReturnValue({
        session: () => ({ exec: () => Promise.resolve([makeItem({ pricingMode: PricingMode.PER_CUBIC_METER })]) }),
      });
      await service.cancel(invoiceId, actor);
      expect(itemModel.updateOne).toHaveBeenCalledWith(
        { _id: expect.anything() },
        { $inc: { stockQuantity: 2 } },
        { session },
      );
    });

    it('rejects double cancel', async () => {
      salesInvoiceModel.findById.mockReturnValue({
        exec: () => Promise.resolve(makeInvoice({ status: SalesInvoiceStatus.CANCELLED })),
      });

      await expect(service.cancel(invoiceId, actor)).rejects.toThrow(BadRequestException);
    });

    it('throws when invoice missing', async () => {
      salesInvoiceModel.findById.mockReturnValue({
        exec: () => Promise.resolve(null),
      });

      await expect(service.cancel(invoiceId, actor)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('rejects editing cancelled invoice', async () => {
      salesInvoiceModel.findById.mockReturnValue({
        exec: () => Promise.resolve(makeInvoice({ status: SalesInvoiceStatus.CANCELLED })),
      });

      await expect(
        service.update(
          invoiceId,
          {
            type: SalesInvoiceType.CASH_SALE,
            lines: [{ itemId, quantity: 1, piecePrice: 450 }],
            paid: 450,
          },
          actor,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('updates cash sale, reconciles stock and in-place payment', async () => {
      const invoice = makeInvoice({
        type: SalesInvoiceType.CASH_SALE,
        customerId: null,
        total: 900,
        paid: 900,
        remaining: 0,
        lines: [
          {
            itemId: { toString: () => itemId },
            quantity: 2,
            piecePrice: 450,
            lineTotal: 900,
          },
        ],
      });

      salesInvoiceModel.findById.mockReturnValue({
        exec: () => Promise.resolve(invoice),
      });

      const existingPayment = {
        amount: 900,
        method: PaymentMethod.CASH,
        customerId: null,
        notes: null,
        save: jest.fn().mockResolvedValue(undefined),
      };

      paymentModel.findOne.mockReturnValue({
        session: () => ({
          exec: () => Promise.resolve(existingPayment),
        }),
      });

      const result = await service.update(
        invoiceId,
        {
          type: SalesInvoiceType.CASH_SALE,
          lines: [{ itemId, quantity: 3, piecePrice: 450 }],
          paid: 1350,
        },
        actor,
      );

      // Reverts old stock (+2) and applies new stock (-3)
      expect(itemModel.updateOne).toHaveBeenCalledWith(
        { _id: { toString: expect.any(Function) } },
        { $inc: { stockQuantity: 2 } },
        { session },
      );
      expect(itemModel.updateOne).toHaveBeenCalledWith({ _id: itemId }, { $inc: { stockQuantity: -3 } }, { session });

      // Updates in-place payment
      expect(existingPayment.amount).toBe(1350);
      expect(existingPayment.save).toHaveBeenCalled();

      expect(result.total).toBe(1350);
      expect(result.paid).toBe(1350);
      expect(result.remaining).toBe(0);
    });

    it('updates customer sale and adjusts customer balance delta', async () => {
      const customer = makeCustomer({ balance: 500 });
      customerModel.findById.mockReturnValue({
        session: () => ({
          exec: () => Promise.resolve(customer),
        }),
        exec: () => Promise.resolve(customer),
      });

      const invoice = makeInvoice({
        type: SalesInvoiceType.CUSTOMER_SALE,
        customerId: { toString: () => customerId },
        total: 900,
        paid: 400,
        remaining: 500,
      });

      salesInvoiceModel.findById.mockReturnValue({
        exec: () => Promise.resolve(invoice),
      });

      const result = await service.update(
        invoiceId,
        {
          type: SalesInvoiceType.CUSTOMER_SALE,
          customerId,
          lines: [{ itemId, quantity: 4, piecePrice: 450 }],
          paid: 600,
        },
        actor,
      );

      expect(result.total).toBe(1800);
      expect(result.remaining).toBe(1200);
      expect(customer.balance).toBe(1200);
    });

    it('rejects cash sale when paid does not equal net', async () => {
      const invoice = makeInvoice();
      salesInvoiceModel.findById.mockReturnValue({
        exec: () => Promise.resolve(invoice),
      });

      await expect(
        service.update(
          invoiceId,
          {
            type: SalesInvoiceType.CASH_SALE,
            lines: [{ itemId, quantity: 1, piecePrice: 450 }],
            paid: 300,
          },
          actor,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('share and pdf', () => {
    it('returns an authenticated receipt with the current customer name', async () => {
      const result = await service.getReceipt(invoiceId);
      expect(result.customerName).toBe('أحمد');
      expect(result.lines[0].itemLabel).toBe('لوح MDF');
      expect(result.invoiceNumber).toBe('INV-0001');
    });

    it('returns a cash receipt without a named customer', async () => {
      salesInvoiceModel.findById.mockReturnValue({
        exec: () => Promise.resolve(makeInvoice({ type: SalesInvoiceType.CASH_SALE, customerId: null })),
      });
      const result = await service.getReceipt(invoiceId);
      expect(result.customerName).toBeNull();
      expect(customerModel.findById).not.toHaveBeenCalled();
    });

    it('returns neighboring invoices for the same customer including cancelled records', async () => {
      const previousId = '507f1f77bcf86cd799439005';
      const nextId = '507f1f77bcf86cd799439006';
      const results = [{ _id: { toString: () => previousId } }, { _id: { toString: () => nextId } }];
      salesInvoiceModel.findOne.mockImplementation((filter: Record<string, unknown>) => ({
        sort: () => ({ select: () => ({ lean: () => ({ exec: () => Promise.resolve(results.shift()) }) }) }),
      }));
      const result = await service.getNeighbors(invoiceId);
      expect(result).toEqual({ previousId, nextId });
      expect(salesInvoiceModel.findOne).toHaveBeenCalledTimes(2);
      expect(salesInvoiceModel.findOne.mock.calls[0][0]).not.toHaveProperty('status');
    });

    it('hides navigation for cash sales', async () => {
      salesInvoiceModel.findById.mockReturnValue({
        exec: () => Promise.resolve(makeInvoice({ type: SalesInvoiceType.CASH_SALE, customerId: null })),
      });
      expect(await service.getNeighbors(invoiceId)).toEqual({ previousId: null, nextId: null });
      expect(salesInvoiceModel.findOne).not.toHaveBeenCalled();
    });

    it('returns null at a history boundary and uses ID to break timestamp ties', async () => {
      const nextId = '507f1f77bcf86cd799439006';
      const results = [null, { _id: { toString: () => nextId } }];
      salesInvoiceModel.findOne.mockImplementation(() => ({
        sort: () => ({ select: () => ({ lean: () => ({ exec: () => Promise.resolve(results.shift()) }) }) }),
      }));
      expect(await service.getNeighbors(invoiceId)).toEqual({ previousId: null, nextId });
      const previousFilter = salesInvoiceModel.findOne.mock.calls[0][0] as { $or: Record<string, unknown>[] };
      const nextFilter = salesInvoiceModel.findOne.mock.calls[1][0] as { $or: Record<string, unknown>[] };
      expect(previousFilter.$or[1]).toHaveProperty('_id.$lt');
      expect(nextFilter.$or[1]).toHaveProperty('_id.$gt');
    });

    it('mints pdfShareToken and returns WhatsApp payload', async () => {
      const invoice = makeInvoice({ pdfShareToken: null });
      salesInvoiceModel.findById.mockReturnValue({
        exec: () => Promise.resolve(invoice),
      });

      const result = await service.getSharePayload(invoiceId);

      expect(invoice.pdfShareToken).toEqual(expect.any(String));
      expect(invoice.pdfShareToken).toHaveLength(64);
      expect(invoice.save).toHaveBeenCalled();
      expect(result.pdfUrl).toContain(`/invoices/public/${invoice.pdfShareToken}`);
      expect(result.whatsappUrl).toContain('https://wa.me/?text=');
      expect(result.message).toContain(invoice.invoiceNumber);
    });

    it('reuses existing token without saving again', async () => {
      const invoice = makeInvoice({ pdfShareToken: 'existing-token-value-0123456789abcdef' });
      salesInvoiceModel.findById.mockReturnValue({
        exec: () => Promise.resolve(invoice),
      });

      const result = await service.getSharePayload(invoiceId);

      expect(invoice.save).not.toHaveBeenCalled();
      expect(result.pdfUrl).toContain('existing-token-value-0123456789abcdef');
    });

    it('returns public invoice by token and throws 404 on missing', async () => {
      const invoice = makeInvoice({
        pdfShareToken: 'tok',
      });
      salesInvoiceModel.findOne.mockReturnValue({
        exec: () => Promise.resolve(invoice),
      });

      const result = await service.getPublicInvoiceByToken('tok');
      expect(result.invoiceNumber).toBe('INV-0001');

      salesInvoiceModel.findOne.mockReturnValue({
        exec: () => Promise.resolve(null),
      });
      await expect(service.getPublicInvoiceByToken('missing')).rejects.toThrow(NotFoundException);
    });
  });
});
