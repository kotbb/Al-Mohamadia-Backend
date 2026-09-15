import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { SalesInvoicesService } from './sales-invoices.service';
import { SalesInvoice } from './schemas/sales-invoice.schema';
import { Payment } from './schemas/payment.schema';
import { InvoiceCounter } from './schemas/invoice-counter.schema';
import { Customer } from '../customers/schemas/customer.schema';
import { Item } from '../items/schemas/item.schema';
import { AuditService } from '../audit/audit.service';
import { UserRole } from '../../shared/auth/enums/user-role.enum';
import { AuthUser } from '../../shared/auth/interfaces/auth-user.interface';
import { PricingMode } from '../../shared/enums/pricing-mode.enum';
import { SalesInvoiceStatus } from '../../shared/enums/sales-invoice-status.enum';
import { SalesInvoiceType } from '../../shared/enums/sales-invoice-type.enum';
import { closeSalesInvoicePdfBrowser } from './pdf/sales-invoice-pdf.builder';

describe('SalesInvoicesService', () => {
  afterAll(async () => {
    await closeSalesInvoicePdfBrowser();
  });

  let service: SalesInvoicesService;
  let salesInvoiceModel: {
    create: jest.Mock;
    find: jest.Mock;
    findById: jest.Mock;
    findOne: jest.Mock;
    countDocuments: jest.Mock;
  };
  let paymentModel: { create: jest.Mock; updateMany: jest.Mock };
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

      expect(itemModel.updateOne).toHaveBeenCalledWith(
        { _id: itemId },
        { $inc: { stockQuantity: -2 } },
        { session },
      );
      expect(paymentModel.create).toHaveBeenCalled();
      expect(customerModel.findOne).not.toHaveBeenCalled();
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'invoice_created' }),
        session,
      );
      expect(result.remaining).toBe(0);
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
      salesInvoiceModel.create.mockResolvedValue([
        makeInvoice({ paid: 400, remaining: 500 }),
      ]);

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
              thickness: 2,
              width: 50,
              length: 100,
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
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'invoice_cancelled' }),
        session,
      );
    });

    it('rejects double cancel', async () => {
      salesInvoiceModel.findById.mockReturnValue({
        exec: () =>
          Promise.resolve(makeInvoice({ status: SalesInvoiceStatus.CANCELLED })),
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

  describe('share and pdf', () => {
    it('mints pdfShareToken and returns WhatsApp payload', async () => {
      const invoice = makeInvoice({ pdfShareToken: null });
      salesInvoiceModel.findById.mockReturnValue({
        exec: () => Promise.resolve(invoice),
      });

      const result = await service.getSharePayload(invoiceId);

      expect(invoice.pdfShareToken).toEqual(expect.any(String));
      expect(invoice.pdfShareToken).toHaveLength(64);
      expect(invoice.save).toHaveBeenCalled();
      expect(result.pdfUrl).toContain(`/api/v1/public/sales-invoices/${invoice.pdfShareToken}/pdf`);
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

    it(
      'builds PDF buffer for invoice id',
      async () => {
        const invoice = makeInvoice();
        salesInvoiceModel.findById.mockReturnValue({
          exec: () => Promise.resolve(invoice),
        });
        itemModel.find.mockReturnValue({
          exec: () => Promise.resolve([makeItem()]),
        });

        const result = await service.getPdfBufferById(invoiceId);

        expect(result.invoiceNumber).toBe('INV-0001');
        expect(result.buffer.length).toBeGreaterThan(100);
        expect(result.buffer.subarray(0, 4).toString()).toBe('%PDF');
      },
      60_000,
    );

    it(
      'builds PDF by public token and 404s on unknown token',
      async () => {
        const invoice = makeInvoice({
          pdfShareToken: 'tok',
          status: SalesInvoiceStatus.CANCELLED,
        });
        salesInvoiceModel.findOne.mockReturnValue({
          exec: () => Promise.resolve(invoice),
        });
        itemModel.find.mockReturnValue({
          exec: () => Promise.resolve([makeItem()]),
        });

        const result = await service.getPdfBufferByToken('tok');
        expect(result.buffer.subarray(0, 4).toString()).toBe('%PDF');

        salesInvoiceModel.findOne.mockReturnValue({
          exec: () => Promise.resolve(null),
        });
        await expect(service.getPdfBufferByToken('missing')).rejects.toThrow(NotFoundException);
      },
      60_000,
    );
  });
});
