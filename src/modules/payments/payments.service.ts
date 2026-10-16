import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { AuthUser } from '../../shared/auth/interfaces/auth-user.interface';
import { PaymentMethod } from '../../shared/enums/payment-method.enum';
import { cairoCustomRange, cairoPeriodRange } from '../../shared/utils/period/cairo-period.util';
import { roundMoney } from '../../shared/utils/round-money/round-money.util';
import { AuditService } from '../audit/audit.service';
import { Customer, CustomerDocument } from '../customers/schemas/customer.schema';
import { ListPaymentsQueryDto } from './dto/list-payments-query.dto';
import { PaymentListResponseDto, PaymentResponseDto } from './dto/payment-response.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { PaymentStatusFilter } from './enums/payment-status-filter.enum';
import { PaymentTypeFilter } from './enums/payment-type-filter.enum';
import { Payment, PaymentDocument } from './schemas/payment.schema';
import { PaymentListFilter } from './types/payment-list-filter.type';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectModel(Payment.name)
    private readonly paymentModel: Model<PaymentDocument>,
    @InjectModel(Customer.name)
    private readonly customerModel: Model<CustomerDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly auditService: AuditService,
  ) {}

  // Record a standalone debt payment
  public async recordPayment(dto: RecordPaymentDto, user: AuthUser): Promise<PaymentResponseDto> {
    const customer = await this.customerModel.findOne({ _id: dto.customerId, isDeleted: false }).exec();

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    if (!customer.isActive) {
      throw new BadRequestException('Customer is inactive');
    }

    if (customer.balance <= 0) {
      throw new BadRequestException('Customer has no outstanding balance');
    }

    const amount = roundMoney(dto.amount);
    if (amount <= 0) {
      throw new BadRequestException('Payment amount must be greater than zero');
    }

    if (amount > customer.balance) {
      throw new BadRequestException(
        `Payment amount (${amount} ج.م) cannot exceed customer balance (${customer.balance} ج.م)`,
      );
    }

    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const lockedCustomer = await this.customerModel
        .findOne({ _id: dto.customerId, isDeleted: false })
        .session(session)
        .exec();

      if (!lockedCustomer) {
        throw new NotFoundException('Customer not found');
      }

      if (!lockedCustomer.isActive) {
        throw new BadRequestException('Customer is inactive');
      }

      if (lockedCustomer.balance <= 0) {
        throw new BadRequestException('Customer has no outstanding balance');
      }

      if (amount > lockedCustomer.balance) {
        throw new BadRequestException(
          `Payment amount (${amount} ج.م) cannot exceed customer balance (${lockedCustomer.balance} ج.م)`,
        );
      }

      const oldBalance = lockedCustomer.balance;
      const newBalance = roundMoney(lockedCustomer.balance - amount);
      lockedCustomer.balance = newBalance;
      await lockedCustomer.save({ session });

      const [createdPayment] = await this.paymentModel.create(
        [
          {
            customerId: lockedCustomer._id,
            invoiceId: null,
            amount,
            method: dto.method ?? PaymentMethod.CASH,
            notes: dto.notes?.trim() || null,
            recordedBy: new Types.ObjectId(user.id),
            reversedAt: null,
            reversedBy: null,
          },
        ],
        { session },
      );

      await this.auditService.log(
        {
          userId: user.id,
          action: 'payment_recorded',
          entityType: 'Payment',
          entityId: createdPayment._id.toString(),
          changes: {
            customerId: { old: null, new: lockedCustomer.name },
            amount: { old: null, new: amount },
            method: { old: null, new: createdPayment.method },
            balance: { old: oldBalance, new: newBalance },
          },
          refCollection: null,
          refId: null,
          summary: `Payment of ${amount} EGP recorded for customer: ${lockedCustomer.name}`,
        },
        session,
      );

      await session.commitTransaction();
      return this.toResponseDto(createdPayment);
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  // Cancel a standalone payment
  public async cancelPayment(id: string, user: AuthUser): Promise<PaymentResponseDto> {
    const payment = await this.paymentModel.findById(id).exec();
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    if (payment.reversedAt !== null) {
      throw new BadRequestException('Payment is already cancelled');
    }

    if (payment.invoiceId !== null) {
      throw new BadRequestException('On-invoice payments can only be cancelled by cancelling the sales invoice');
    }

    if (!payment.customerId) {
      throw new BadRequestException('Payment has no associated customer');
    }

    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const lockedPayment = await this.paymentModel.findById(id).session(session).exec();
      if (!lockedPayment) {
        throw new NotFoundException('Payment not found');
      }

      if (lockedPayment.reversedAt !== null) {
        throw new BadRequestException('Payment is already cancelled');
      }

      const lockedCustomer = await this.customerModel
        .findOne({ _id: lockedPayment.customerId, isDeleted: false })
        .session(session)
        .exec();

      if (!lockedCustomer) {
        throw new NotFoundException('Associated customer not found');
      }

      const oldBalance = lockedCustomer.balance;
      const newBalance = roundMoney(lockedCustomer.balance + lockedPayment.amount);
      lockedCustomer.balance = newBalance;
      await lockedCustomer.save({ session });

      const now = new Date();
      lockedPayment.reversedAt = now;
      lockedPayment.reversedBy = new Types.ObjectId(user.id);
      await lockedPayment.save({ session });

      await this.auditService.log(
        {
          userId: user.id,
          action: 'payment_cancelled',
          entityType: 'Payment',
          entityId: lockedPayment._id.toString(),
          changes: {
            reversedAt: { old: null, new: now },
            reversedBy: { old: null, new: user.username },
            balance: { old: oldBalance, new: newBalance },
          },
          refCollection: null,
          refId: null,
          summary: `Payment of ${lockedPayment.amount} EGP cancelled for customer: ${lockedCustomer.name}`,
        },
        session,
      );

      await session.commitTransaction();
      return this.toResponseDto(lockedPayment);
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  // List payments with filters and pagination
  public async findAll(query: ListPaymentsQueryDto): Promise<PaymentListResponseDto> {
    if (query.period !== undefined && !query.date) {
      throw new BadRequestException('date is required when period is set');
    }
    if (query.date && query.period === undefined) {
      throw new BadRequestException('period is required when date is set');
    }

    const filter = this.buildListFilter(query);
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 10, 100);
    const skip = (page - 1) * limit;

    const activeFilter = { ...filter, reversedAt: null };

    const [rawPayments, total, summaryAgg] = await Promise.all([
      this.paymentModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      this.paymentModel.countDocuments(filter).exec(),
      this.paymentModel.aggregate<{ totalAmount: number }>([
        { $match: activeFilter },
        { $group: { _id: null, totalAmount: { $sum: '$amount' } } },
      ]),
    ]);

    const totalAmount = summaryAgg.length > 0 ? roundMoney(summaryAgg[0].totalAmount) : 0;

    return {
      items: rawPayments.map((p) => this.toResponseDto(p)),
      meta: {
        page,
        limit,
        total,
      },
      summary: {
        totalAmount,
      },
    };
  }

  // Get a single payment by ID
  public async findOne(id: string): Promise<PaymentResponseDto> {
    const payment = await this.paymentModel.findById(id).exec();
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }
    return this.toResponseDto(payment);
  }

  // ----------------- Helper Methods -----------------

  private buildListFilter(query: ListPaymentsQueryDto): PaymentListFilter {
    const filter: PaymentListFilter = {};

    if (query.customerId) {
      filter.customerId = new Types.ObjectId(query.customerId);
    }

    if (query.invoiceId) {
      if (query.type === PaymentTypeFilter.STANDALONE) {
        throw new BadRequestException('Cannot filter by invoiceId when type is standalone');
      }
      filter.invoiceId = new Types.ObjectId(query.invoiceId);
    } else {
      const type = query.type ?? PaymentTypeFilter.ALL;
      if (type === PaymentTypeFilter.STANDALONE) {
        filter.invoiceId = null;
      } else if (type === PaymentTypeFilter.INVOICE) {
        filter.invoiceId = { $ne: null };
      }
    }

    if (query.method) {
      filter.method = query.method;
    }

    const status = query.status ?? PaymentStatusFilter.ACTIVE;
    if (status === PaymentStatusFilter.ACTIVE) {
      filter.reversedAt = null;
    } else if (status === PaymentStatusFilter.REVERSED) {
      filter.reversedAt = { $ne: null };
    }

    if (query.from || query.to) {
      if (query.period || query.date) throw new BadRequestException('Choose a period or a custom range');
      try {
        const { from, to } = cairoCustomRange(query.from, query.to);
        filter.createdAt = { $gte: from, $lt: to };
      } catch {
        throw new BadRequestException('Invalid custom date range');
      }
    } else if (query.period && query.date) {
      try {
        const { from, to } = cairoPeriodRange(query.period, query.date);
        filter.createdAt = { $gte: from, $lt: to };
      } catch {
        throw new BadRequestException('Invalid date for period filter');
      }
    }

    return filter;
  }

  private toResponseDto(payment: PaymentDocument): PaymentResponseDto {
    return {
      id: payment._id.toString(),
      customerId: payment.customerId ? payment.customerId.toString() : null,
      invoiceId: payment.invoiceId ? payment.invoiceId.toString() : null,
      amount: roundMoney(payment.amount),
      method: payment.method ?? PaymentMethod.CASH,
      notes: payment.notes ?? null,
      recordedBy: payment.recordedBy.toString(),
      reversedAt: payment.reversedAt ?? null,
      reversedBy: payment.reversedBy ? payment.reversedBy.toString() : null,
      isReversed: payment.reversedAt !== null,
      createdAt: payment.get('createdAt') as Date | undefined,
      updatedAt: payment.get('updatedAt') as Date | undefined,
    };
  }
}
