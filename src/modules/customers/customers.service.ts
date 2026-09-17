import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import { Customer, CustomerDocument } from './schemas/customer.schema';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { MergeCustomersDto } from './dto/merge-customers.dto';
import { ListCustomersQueryDto } from './dto/list-customers-query.dto';
import { CustomerListResponseDto, CustomerResponseDto } from './dto/customer-response.dto';
import { AuditService } from '../audit/audit.service';
import { Payment, PaymentDocument } from '../payments/schemas/payment.schema';
import { SalesInvoice, SalesInvoiceDocument } from '../sales-invoices/schemas/sales-invoice.schema';
import { AuthUser } from '../../shared/auth/interfaces/auth-user.interface';
import { normalizePhone } from '../../shared/utils/normalize-phone/normalize-phone.util';
import { normalizeOptionalAddress } from '../../shared/utils/normalize-optional-address/normalize-optional-address.util';
import { roundMoney } from '../../shared/utils/round-money/round-money.util';
import { CustomerListFilter } from './types/customer-list-filter.type';

@Injectable()
export class CustomersService {
  constructor(
    @InjectModel(Customer.name)
    private readonly customerModel: Model<CustomerDocument>,
    @InjectModel(SalesInvoice.name)
    private readonly salesInvoiceModel: Model<SalesInvoiceDocument>,
    @InjectModel(Payment.name)
    private readonly paymentModel: Model<PaymentDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly auditService: AuditService,
  ) {}

  public async create(dto: CreateCustomerDto, user: AuthUser): Promise<CustomerResponseDto> {
    const name = dto.name.trim();
    const phone = normalizePhone(dto.phone);
    if (!phone) {
      throw new BadRequestException('Phone is required');
    }

    const existing = await this.customerModel.findOne({ phone, isDeleted: false }).lean().exec();
    if (existing) {
      throw new ConflictException('Customer phone already exists');
    }

    const balance = roundMoney(dto.balance ?? 0);
    const address = normalizeOptionalAddress(dto.address);

    const session = await this.connection.startSession();
    session.startTransaction();
    try {
      const [created] = await this.customerModel.create(
        [
          {
            name,
            phone,
            address,
            balance,
            isActive: true,
            isDeleted: false,
          },
        ],
        { session },
      );

      await this.auditService.log(
        {
          userId: user.id,
          action: 'customer_created',
          entityType: 'Customer',
          entityId: created._id.toString(),
          changes: {
            name: { old: null, new: created.name },
            phone: { old: null, new: created.phone },
            address: { old: null, new: created.address },
            balance: { old: null, new: created.balance },
            isActive: { old: null, new: true },
          },
          refCollection: null,
          refId: null,
          summary: `Customer created: ${created.name}`,
        },
        session,
      );

      await session.commitTransaction();
      return this.toResponseDto(created);
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  public async findAll(query: ListCustomersQueryDto): Promise<CustomerListResponseDto> {
    const filter = this.buildListFilter(query);
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const [docs, total, summaryRows] = await Promise.all([
      this.customerModel.find(filter).sort({ balance: -1, name: 1 }).skip(skip).limit(limit).exec(),
      this.customerModel.countDocuments(filter).exec(),
      this.customerModel
        .aggregate<{ totalDebt: number }>([
          { $match: filter },
          { $group: { _id: null, totalDebt: { $sum: '$balance' } } },
        ])
        .exec(),
    ]);

    return {
      items: docs.map((doc) => this.toResponseDto(doc)),
      meta: { page, limit, total },
      summary: { totalDebt: roundMoney(summaryRows[0]?.totalDebt ?? 0) },
    };
  }

  public async findOne(id: string): Promise<CustomerResponseDto> {
    const customer = await this.customerModel.findOne({ _id: id, isDeleted: false }).exec();
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }
    return this.toResponseDto(customer);
  }

  public async update(id: string, dto: UpdateCustomerDto, user: AuthUser): Promise<CustomerResponseDto> {
    const customer = await this.customerModel.findOne({ _id: id, isDeleted: false }).exec();
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const changes: Record<string, { old: unknown; new: unknown }> = {};

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (name !== customer.name) {
        changes.name = { old: customer.name, new: name };
        customer.name = name;
      }
    }

    if (dto.phone !== undefined) {
      const phone = normalizePhone(dto.phone);
      if (!phone) {
        throw new BadRequestException('Phone is required');
      }
      if (phone !== customer.phone) {
        const existing = await this.customerModel
          .findOne({ phone, isDeleted: false, _id: { $ne: customer._id } })
          .lean()
          .exec();
        if (existing) {
          throw new ConflictException('Customer phone already exists');
        }
        changes.phone = { old: customer.phone, new: phone };
        customer.phone = phone;
      }
    }

    if (dto.address !== undefined) {
      const address = normalizeOptionalAddress(dto.address);
      if (address !== customer.address) {
        changes.address = { old: customer.address, new: address };
        customer.address = address;
      }
    }

    if (dto.isActive !== undefined && dto.isActive !== customer.isActive) {
      changes.isActive = { old: customer.isActive, new: dto.isActive };
      customer.isActive = dto.isActive;
    }

    if (Object.keys(changes).length === 0) {
      return this.toResponseDto(customer);
    }

    const session = await this.connection.startSession();
    session.startTransaction();
    try {
      await customer.save({ session });
      await this.auditService.log(
        {
          userId: user.id,
          action: 'customer_edited',
          entityType: 'Customer',
          entityId: customer._id.toString(),
          changes,
          refCollection: null,
          refId: null,
          summary: `Customer edited: ${customer.name}`,
        },
        session,
      );
      await session.commitTransaction();
      return this.toResponseDto(customer);
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  public async softDelete(id: string, user: AuthUser): Promise<CustomerResponseDto> {
    const customer = await this.customerModel.findOne({ _id: id, isDeleted: false }).exec();
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    if (customer.balance !== 0) {
      throw new ConflictException('Customer has outstanding balance, cannot be deleted');
    }

    const session = await this.connection.startSession();
    session.startTransaction();
    try {
      const oldIsActive = customer.isActive;
      customer.isDeleted = true;
      customer.isActive = false;
      await customer.save({ session });

      await this.auditService.log(
        {
          userId: user.id,
          action: 'customer_deleted',
          entityType: 'Customer',
          entityId: customer._id.toString(),
          changes: {
            isDeleted: { old: false, new: true },
            isActive: { old: oldIsActive, new: false },
          },
          refCollection: null,
          refId: null,
          summary: `Customer deleted: ${customer.name}`,
        },
        session,
      );

      await session.commitTransaction();
      return this.toResponseDto(customer);
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  public async merge(dto: MergeCustomersDto, user: AuthUser): Promise<CustomerResponseDto> {
    if (dto.sourceIds.includes(dto.targetId)) {
      throw new BadRequestException('Source customers must not include the target customer');
    }

    const target = await this.customerModel.findOne({ _id: dto.targetId, isDeleted: false }).exec();
    if (!target) {
      throw new NotFoundException('Target customer not found');
    }

    const sources = await this.customerModel.find({ _id: { $in: dto.sourceIds }, isDeleted: false }).exec();

    if (sources.length !== dto.sourceIds.length) {
      throw new NotFoundException('One or more source customers were not found');
    }

    const oldTargetBalance = target.balance;
    const oldTargetName = target.name;
    const oldTargetPhone = target.phone;
    const sourcesBalanceSum = sources.reduce((sum, source) => sum + source.balance, 0);

    if (dto.name !== undefined) {
      target.name = dto.name.trim();
    }

    if (dto.phone !== undefined) {
      const phone = normalizePhone(dto.phone);
      if (!phone) {
        throw new BadRequestException('Phone is required');
      }
      if (phone !== target.phone) {
        const excludedIds = [target._id, ...sources.map((source) => source._id)];
        const existing = await this.customerModel
          .findOne({
            phone,
            isDeleted: false,
            _id: { $nin: excludedIds },
          })
          .lean()
          .exec();
        if (existing) {
          throw new ConflictException('Customer phone already exists');
        }
        target.phone = phone;
      }
    }

    target.balance = roundMoney(oldTargetBalance + sourcesBalanceSum);

    const sourceIds = sources.map((source) => source._id.toString());
    const sourceNames = sources.map((source) => source.name);
    const changes: Record<string, { old: unknown; new: unknown }> = {
      sourceIds: { old: null, new: sourceIds },
      targetId: { old: null, new: target._id.toString() },
      balance: { old: oldTargetBalance, new: target.balance },
      sourcesBalanceSum: { old: sourcesBalanceSum, new: 0 },
    };

    if (target.name !== oldTargetName) {
      changes.name = { old: oldTargetName, new: target.name };
    }
    if (target.phone !== oldTargetPhone) {
      changes.phone = { old: oldTargetPhone, new: target.phone };
    }

    const session = await this.connection.startSession();
    session.startTransaction();
    try {
      const sourceObjectIds = sources.map((source) => source._id);

      await this.salesInvoiceModel.updateMany(
        { customerId: { $in: sourceObjectIds } },
        { $set: { customerId: target._id } },
        { session },
      );

      await this.paymentModel.updateMany(
        { customerId: { $in: sourceObjectIds } },
        { $set: { customerId: target._id } },
        { session },
      );

      for (const source of sources) {
        source.isDeleted = true;
        source.isActive = false;
        source.balance = 0;
        await source.save({ session });
      }

      await target.save({ session });

      await this.auditService.log(
        {
          userId: user.id,
          action: 'customer_merged',
          entityType: 'Customer',
          entityId: target._id.toString(),
          changes,
          refCollection: null,
          refId: null,
          summary: `Customers merged: ${sourceNames.join(', ')} → ${target.name}`,
        },
        session,
      );

      await session.commitTransaction();
      return this.toResponseDto(target);
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  // ----------------- Helper Methods -----------------

  private buildListFilter(query: ListCustomersQueryDto): CustomerListFilter {
    const filter: CustomerListFilter = { isDeleted: false };

    if (query.hasDebt === true) {
      filter.balance = { $gt: 0 };
    }

    if (query.isActive !== undefined) {
      filter.isActive = query.isActive;
    }

    if (query.q?.trim()) {
      const escaped = query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [{ name: { $regex: escaped, $options: 'i' } }, { phone: { $regex: escaped, $options: 'i' } }];
    }

    return filter;
  }

  private toResponseDto(customer: CustomerDocument): CustomerResponseDto {
    return {
      id: customer._id.toString(),
      name: customer.name,
      phone: customer.phone,
      address: customer.address ?? null,
      balance: customer.balance,
      isActive: customer.isActive,
      isDeleted: customer.isDeleted,
      createdAt: customer.get('createdAt') as Date | undefined,
      updatedAt: customer.get('updatedAt') as Date | undefined,
    };
  }
}
