import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { AuthUser } from '../../shared/auth/interfaces/auth-user.interface';
import { PaymentMethod } from '../../shared/enums/payment-method.enum';
import { cairoCustomRange, cairoPeriodRange } from '../../shared/utils/period/cairo-period.util';
import { roundMoney } from '../../shared/utils/round-money/round-money.util';
import { AuditService } from '../audit/audit.service';
import { PaymentStatusFilter } from '../payments/enums/payment-status-filter.enum';
import { PaymentTypeFilter } from '../payments/enums/payment-type-filter.enum';
import { Supplier, SupplierDocument } from '../suppliers/schemas/supplier.schema';
import { ListSupplierPaymentsQueryDto } from './dto/list-supplier-payments-query.dto';
import { SupplierPaymentListResponseDto, SupplierPaymentResponseDto } from './dto/supplier-payment-response.dto';
import { RecordSupplierPaymentDto } from './dto/record-supplier-payment.dto';
import { SupplierPayment, SupplierPaymentDocument } from './schemas/supplier-payment.schema';
import { SupplierPaymentListFilter } from './types/supplier-payment-list-filter.type';

@Injectable()
export class SupplierPaymentsService {
  constructor(
    @InjectModel(SupplierPayment.name)
    private readonly supplierPaymentModel: Model<SupplierPaymentDocument>,
    @InjectModel(Supplier.name)
    private readonly supplierModel: Model<SupplierDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly auditService: AuditService,
  ) {}

  // Record a standalone debt payment to a supplier
  public async recordPayment(dto: RecordSupplierPaymentDto, user: AuthUser): Promise<SupplierPaymentResponseDto> {
    const supplier = await this.supplierModel.findOne({ _id: dto.supplierId, isDeleted: false }).exec();

    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }

    if (!supplier.isActive) {
      throw new BadRequestException('Supplier is inactive');
    }

    if (supplier.amountOwed <= 0) {
      throw new BadRequestException('Supplier has no outstanding debt owed');
    }

    const amount = roundMoney(dto.amount);
    if (amount <= 0) {
      throw new BadRequestException('Payment amount must be greater than zero');
    }

    if (amount > supplier.amountOwed) {
      throw new BadRequestException(
        `Payment amount (${amount} ج.م) cannot exceed supplier debt owed (${supplier.amountOwed} ج.م)`,
      );
    }

    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const lockedSupplier = await this.supplierModel
        .findOne({ _id: dto.supplierId, isDeleted: false })
        .session(session)
        .exec();

      if (!lockedSupplier) {
        throw new NotFoundException('Supplier not found');
      }

      if (!lockedSupplier.isActive) {
        throw new BadRequestException('Supplier is inactive');
      }

      if (lockedSupplier.amountOwed <= 0) {
        throw new BadRequestException('Supplier has no outstanding debt owed');
      }

      if (amount > lockedSupplier.amountOwed) {
        throw new BadRequestException(
          `Payment amount (${amount} ج.م) cannot exceed supplier debt owed (${lockedSupplier.amountOwed} ج.م)`,
        );
      }

      const oldAmountOwed = lockedSupplier.amountOwed;
      const newAmountOwed = roundMoney(lockedSupplier.amountOwed - amount);
      lockedSupplier.amountOwed = newAmountOwed;
      await lockedSupplier.save({ session });

      const [createdPayment] = await this.supplierPaymentModel.create(
        [
          {
            supplierId: lockedSupplier._id,
            purchaseInvoiceId: null,
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
          action: 'supplier_payment_recorded',
          entityType: 'SupplierPayment',
          entityId: createdPayment._id.toString(),
          changes: {
            supplierId: { old: null, new: lockedSupplier.name },
            amount: { old: null, new: amount },
            method: { old: null, new: createdPayment.method },
            amountOwed: { old: oldAmountOwed, new: newAmountOwed },
          },
          refCollection: null,
          refId: null,
          summary: `Payment of ${amount} EGP recorded for supplier: ${lockedSupplier.name}`,
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

  // Cancel a supplier payment (reverses debt reduction)
  public async cancelPayment(id: string, user: AuthUser): Promise<SupplierPaymentResponseDto> {
    const payment = await this.supplierPaymentModel.findById(id).exec();
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    if (payment.reversedAt !== null) {
      throw new BadRequestException('Payment is already cancelled');
    }

    if (payment.purchaseInvoiceId !== null) {
      throw new BadRequestException(
        'Purchase invoice payments can only be cancelled by cancelling the purchase invoice',
      );
    }

    if (!payment.supplierId) {
      throw new BadRequestException('Payment has no associated supplier');
    }

    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const lockedPayment = await this.supplierPaymentModel.findById(id).session(session).exec();
      if (!lockedPayment) {
        throw new NotFoundException('Payment not found');
      }

      if (lockedPayment.reversedAt !== null) {
        throw new BadRequestException('Payment is already cancelled');
      }

      // Find supplier (even if inactive/soft-deleted per decision to allow cancellation)
      const lockedSupplier = await this.supplierModel.findById(lockedPayment.supplierId).session(session).exec();

      if (!lockedSupplier) {
        throw new NotFoundException('Associated supplier not found');
      }

      const oldAmountOwed = lockedSupplier.amountOwed;
      const newAmountOwed = roundMoney(lockedSupplier.amountOwed + lockedPayment.amount);
      lockedSupplier.amountOwed = newAmountOwed;
      await lockedSupplier.save({ session });

      const now = new Date();
      lockedPayment.reversedAt = now;
      lockedPayment.reversedBy = new Types.ObjectId(user.id);
      await lockedPayment.save({ session });

      await this.auditService.log(
        {
          userId: user.id,
          action: 'supplier_payment_cancelled',
          entityType: 'SupplierPayment',
          entityId: lockedPayment._id.toString(),
          changes: {
            reversedAt: { old: null, new: now },
            reversedBy: { old: null, new: user.username },
            amountOwed: { old: oldAmountOwed, new: newAmountOwed },
          },
          refCollection: null,
          refId: null,
          summary: `Payment of ${lockedPayment.amount} EGP cancelled for supplier: ${lockedSupplier.name}`,
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

  // List supplier payments with filters and pagination
  public async findAll(query: ListSupplierPaymentsQueryDto): Promise<SupplierPaymentListResponseDto> {
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
      this.supplierPaymentModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      this.supplierPaymentModel.countDocuments(filter).exec(),
      this.supplierPaymentModel.aggregate<{ totalAmount: number }>([
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

  // Get a single supplier payment by ID
  public async findOne(id: string): Promise<SupplierPaymentResponseDto> {
    const payment = await this.supplierPaymentModel.findById(id).exec();
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }
    return this.toResponseDto(payment);
  }

  // ----------------- Helper Methods -----------------

  private buildListFilter(query: ListSupplierPaymentsQueryDto): SupplierPaymentListFilter {
    const filter: SupplierPaymentListFilter = {};

    if (query.supplierId) {
      filter.supplierId = new Types.ObjectId(query.supplierId);
    }

    if (query.purchaseInvoiceId) {
      if (query.type === PaymentTypeFilter.STANDALONE) {
        throw new BadRequestException('Cannot filter by purchaseInvoiceId when type is standalone');
      }
      filter.purchaseInvoiceId = new Types.ObjectId(query.purchaseInvoiceId);
    } else {
      const type = query.type ?? PaymentTypeFilter.ALL;
      if (type === PaymentTypeFilter.STANDALONE) {
        filter.purchaseInvoiceId = null;
      } else if (type === PaymentTypeFilter.INVOICE) {
        filter.purchaseInvoiceId = { $ne: null };
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

  private toResponseDto(payment: SupplierPaymentDocument): SupplierPaymentResponseDto {
    return {
      id: payment._id.toString(),
      supplierId: payment.supplierId.toString(),
      purchaseInvoiceId: payment.purchaseInvoiceId ? payment.purchaseInvoiceId.toString() : null,
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
