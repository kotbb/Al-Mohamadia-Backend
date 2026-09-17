import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '../../shared/auth/enums/user-role.enum';
import { AuthUser } from '../../shared/auth/interfaces/auth-user.interface';
import { PaymentMethod } from '../../shared/enums/payment-method.enum';
import { SalesInvoicePeriod } from '../../shared/enums/sales-invoice-period.enum';
import { AuditService } from '../audit/audit.service';
import { Customer } from '../customers/schemas/customer.schema';
import { ListPaymentsQueryDto } from './dto/list-payments-query.dto';
import { PaymentStatusFilter } from './enums/payment-status-filter.enum';
import { PaymentTypeFilter } from './enums/payment-type-filter.enum';
import { PaymentsService } from './payments.service';
import { Payment } from './schemas/payment.schema';

describe('PaymentsService', () => {
  let service: PaymentsService;
  let paymentModel: {
    create: jest.Mock;
    findById: jest.Mock;
    find: jest.Mock;
    countDocuments: jest.Mock;
    aggregate: jest.Mock;
  };
  let customerModel: {
    findOne: jest.Mock;
    findById: jest.Mock;
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

  const customerId = '507f1f77bcf86cd799439011';
  const paymentId = '507f1f77bcf86cd799439022';
  const invoiceId = '507f1f77bcf86cd799439033';

  const makeCustomer = (overrides: Record<string, unknown> = {}) => ({
    _id: { toString: () => customerId },
    name: 'أحمد محمود',
    phone: '01012345678',
    balance: 5000,
    isActive: true,
    isDeleted: false,
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  });

  const makePayment = (overrides: Record<string, unknown> = {}) => ({
    _id: { toString: () => paymentId },
    customerId: { toString: () => customerId },
    invoiceId: null,
    amount: 2000,
    method: PaymentMethod.CASH,
    notes: 'Test note',
    recordedBy: { toString: () => actor.id },
    reversedAt: null,
    reversedBy: null,
    get: (key: string) => (key === 'createdAt' || key === 'updatedAt' ? new Date() : undefined),
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  });

  const mockQuery = <T>(val: T) => {
    const obj = {
      session: jest.fn().mockReturnThis(),
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

    paymentModel = {
      create: jest.fn(),
      findById: jest.fn(),
      find: jest.fn(),
      countDocuments: jest.fn(),
      aggregate: jest.fn(),
    };

    customerModel = {
      findOne: jest.fn(),
      findById: jest.fn(),
    };

    auditService = { log: jest.fn().mockResolvedValue(undefined) };
    connection = { startSession: jest.fn().mockResolvedValue(session) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: getModelToken(Payment.name), useValue: paymentModel },
        { provide: getModelToken(Customer.name), useValue: customerModel },
        { provide: getConnectionToken(), useValue: connection },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
  });

  describe('recordPayment', () => {
    it('successfully records a standalone payment and reduces customer balance', async () => {
      const customer = makeCustomer({ balance: 5000 });
      customerModel.findOne.mockReturnValue(mockQuery(customer));

      const createdDoc = makePayment({
        _id: { toString: () => paymentId },
        amount: 1500,
        method: PaymentMethod.INSTAPAY,
        notes: 'دفعة حساب',
      });
      paymentModel.create.mockResolvedValue([createdDoc]);

      const result = await service.recordPayment(
        {
          customerId,
          amount: 1500,
          method: PaymentMethod.INSTAPAY,
          notes: 'دفعة حساب',
        },
        actor,
      );

      expect(customer.balance).toBe(3500);
      expect(customer.save).toHaveBeenCalledWith({ session });
      expect(paymentModel.create).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            customerId: customer._id,
            invoiceId: null,
            amount: 1500,
            method: PaymentMethod.INSTAPAY,
            notes: 'دفعة حساب',
          }),
        ],
        { session },
      );
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'payment_recorded',
          entityType: 'Payment',
        }),
        session,
      );
      expect(session.commitTransaction).toHaveBeenCalled();
      expect(result.amount).toBe(1500);
      expect(result.method).toBe(PaymentMethod.INSTAPAY);
    });

    it('throws NotFoundException if customer not found', async () => {
      customerModel.findOne.mockReturnValue(mockQuery(null));

      await expect(service.recordPayment({ customerId, amount: 500 }, actor)).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException if customer is inactive', async () => {
      customerModel.findOne.mockReturnValue(mockQuery(makeCustomer({ isActive: false })));

      await expect(service.recordPayment({ customerId, amount: 500 }, actor)).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if customer balance is 0 or negative', async () => {
      customerModel.findOne.mockReturnValue(mockQuery(makeCustomer({ balance: 0 })));

      await expect(service.recordPayment({ customerId, amount: 500 }, actor)).rejects.toThrow(
        'Customer has no outstanding balance',
      );
    });

    it('throws BadRequestException if payment amount exceeds balance', async () => {
      customerModel.findOne.mockReturnValue(mockQuery(makeCustomer({ balance: 1000 })));

      await expect(service.recordPayment({ customerId, amount: 1500 }, actor)).rejects.toThrow(
        'Payment amount (1500 ج.م) cannot exceed customer balance (1000 ج.م)',
      );
    });

    it('re-validates balance inside session and throws when balance changed concurrently', async () => {
      const initialCustomer = makeCustomer({ balance: 5000 });
      const lockedCustomer = makeCustomer({ balance: 1000 });

      customerModel.findOne
        .mockReturnValueOnce(mockQuery(initialCustomer))
        .mockReturnValueOnce(mockQuery(lockedCustomer));

      await expect(
        service.recordPayment({ customerId, amount: 1500 }, actor),
      ).rejects.toThrow('Payment amount (1500 ج.م) cannot exceed customer balance (1000 ج.م)');

      expect(session.abortTransaction).toHaveBeenCalled();
    });
  });

  describe('cancelPayment', () => {
    it('successfully cancels a standalone payment and restores customer balance', async () => {
      const payment = makePayment({
        amount: 2000,
        invoiceId: null,
        reversedAt: null,
      });
      paymentModel.findById.mockReturnValue(mockQuery(payment));

      const customer = makeCustomer({ balance: 3000 });
      customerModel.findOne.mockReturnValue(mockQuery(customer));

      const result = await service.cancelPayment(paymentId, actor);

      expect(customer.balance).toBe(5000);
      expect(customer.save).toHaveBeenCalledWith({ session });
      expect(payment.reversedAt).toBeInstanceOf(Date);
      expect(payment.save).toHaveBeenCalledWith({ session });
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'payment_cancelled',
          entityType: 'Payment',
        }),
        session,
      );
      expect(session.commitTransaction).toHaveBeenCalled();
      expect(result.isReversed).toBe(true);
    });

    it('throws NotFoundException if payment not found', async () => {
      paymentModel.findById.mockReturnValue(mockQuery(null));

      await expect(service.cancelPayment(paymentId, actor)).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException if payment is already cancelled', async () => {
      const payment = makePayment({ reversedAt: new Date() });
      paymentModel.findById.mockReturnValue(mockQuery(payment));

      await expect(service.cancelPayment(paymentId, actor)).rejects.toThrow('Payment is already cancelled');
    });

    it('throws BadRequestException if trying to cancel an on-invoice payment', async () => {
      const payment = makePayment({
        invoiceId: { toString: () => invoiceId },
        reversedAt: null,
      });
      paymentModel.findById.mockReturnValue(mockQuery(payment));

      await expect(service.cancelPayment(paymentId, actor)).rejects.toThrow(
        'On-invoice payments can only be cancelled by cancelling the sales invoice',
      );
    });

    it('re-checks reversedAt inside session and throws if already reversed', async () => {
      const initialPayment = makePayment({
        amount: 2000,
        invoiceId: null,
        reversedAt: null,
      });
      const lockedPayment = makePayment({
        amount: 2000,
        invoiceId: null,
        reversedAt: new Date(),
      });

      paymentModel.findById
        .mockReturnValueOnce(mockQuery(initialPayment))
        .mockReturnValueOnce(mockQuery(lockedPayment));

      await expect(service.cancelPayment(paymentId, actor)).rejects.toThrow('Payment is already cancelled');

      expect(session.abortTransaction).toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('filters payments, paginates, and returns totalAmount summary', async () => {
      const rawPayment = makePayment();
      const mockQueryChain = {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([rawPayment]),
      };

      paymentModel.find.mockReturnValue(mockQueryChain);
      paymentModel.countDocuments.mockReturnValue({
        exec: jest.fn().mockResolvedValue(1),
      });
      paymentModel.aggregate.mockResolvedValue([{ _id: null, totalAmount: 2000 }]);

      const query: ListPaymentsQueryDto = {
        customerId,
        status: PaymentStatusFilter.ACTIVE,
        type: PaymentTypeFilter.STANDALONE,
        method: PaymentMethod.CASH,
        page: 1,
        limit: 20,
      };

      const result = await service.findAll(query);

      expect(paymentModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          reversedAt: null,
          invoiceId: null,
          method: PaymentMethod.CASH,
        }),
      );
      expect(result.items).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(result.summary.totalAmount).toBe(2000);
    });

    it('throws BadRequestException when period is set but date is missing', async () => {
      await expect(
        service.findAll({ period: SalesInvoicePeriod.DAY } as any),
      ).rejects.toThrow('date is required when period is set');
    });

    it('throws BadRequestException when date is set but period is missing', async () => {
      await expect(
        service.findAll({ date: '2026-09-17' } as any),
      ).rejects.toThrow('period is required when date is set');
    });

    it('throws BadRequestException when invoiceId combined with type=standalone', async () => {
      await expect(
        service.findAll({ invoiceId, type: PaymentTypeFilter.STANDALONE }),
      ).rejects.toThrow('Cannot filter by invoiceId when type is standalone');
    });

    it('filters by specific invoiceId when type=invoice is provided', async () => {
      const rawPayment = makePayment({ invoiceId: { toString: () => invoiceId } });
      const mockQueryChain = {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([rawPayment]),
      };

      paymentModel.find.mockReturnValue(mockQueryChain);
      paymentModel.countDocuments.mockReturnValue({
        exec: jest.fn().mockResolvedValue(1),
      });
      paymentModel.aggregate.mockResolvedValue([{ _id: null, totalAmount: 2000 }]);

      await service.findAll({ invoiceId, type: PaymentTypeFilter.INVOICE });

      expect(paymentModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          invoiceId: expect.any(Object),
        }),
      );
    });

    it('wraps cairoPeriodRange error as BadRequestException', async () => {
      await expect(
        service.findAll({ period: SalesInvoicePeriod.DAY, date: 'invalid-date' }),
      ).rejects.toThrow('Invalid date for period filter');
    });

    it('totalAmount summary excludes reversed payments when status=all', async () => {
      const rawPayment = makePayment();
      const mockQueryChain = {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([rawPayment]),
      };

      paymentModel.find.mockReturnValue(mockQueryChain);
      paymentModel.countDocuments.mockReturnValue({
        exec: jest.fn().mockResolvedValue(1),
      });
      paymentModel.aggregate.mockResolvedValue([{ _id: null, totalAmount: 2000 }]);

      await service.findAll({ status: PaymentStatusFilter.ALL });

      expect(paymentModel.find).toHaveBeenCalledWith(
        expect.not.objectContaining({ reversedAt: null }),
      );
      expect(paymentModel.aggregate).toHaveBeenCalledWith([
        { $match: expect.objectContaining({ reversedAt: null }) },
        { $group: { _id: null, totalAmount: { $sum: '$amount' } } },
      ]);
    });
  });

  describe('findOne', () => {
    it('returns a payment if found', async () => {
      const rawPayment = makePayment();
      paymentModel.findById.mockReturnValue(mockQuery(rawPayment));

      const result = await service.findOne(paymentId);
      expect(result.id).toBe(paymentId);
      expect(result.amount).toBe(2000);
    });

    it('throws NotFoundException if not found', async () => {
      paymentModel.findById.mockReturnValue(mockQuery(null));

      await expect(service.findOne(paymentId)).rejects.toThrow(NotFoundException);
    });
  });
});
