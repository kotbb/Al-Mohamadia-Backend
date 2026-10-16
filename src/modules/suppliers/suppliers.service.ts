import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import { Supplier, SupplierDocument } from './schemas/supplier.schema';
import { CreateSupplierDto } from './dto/request/create-supplier.dto';
import { UpdateSupplierDto } from './dto/request/update-supplier.dto';
import { MergeSuppliersDto } from './dto/request/merge-suppliers.dto';
import { ListSuppliersQueryDto } from './dto/request/list-suppliers-query.dto';
import { SupplierListResponseDto, SupplierResponseDto } from './dto/response/supplier-response.dto';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../../shared/auth/interfaces/auth-user.interface';
import {
  assertEgyptianMobile,
  equivalentMobilePhones,
  normalizeOptionalPhone,
} from '../../shared/utils/normalize-phone/normalize-phone.util';
import { normalizeOptionalAddress } from '../../shared/utils/normalize-optional-address/normalize-optional-address.util';
import { roundMoney } from '../../shared/utils/round-money/round-money.util';
import { PurchaseInvoice, PurchaseInvoiceDocument } from '../purchases/schemas/purchase-invoice.schema';
import { SupplierListFilter } from './types/supplier-list-filter.type';

@Injectable()
export class SuppliersService {
  constructor(
    @InjectModel(Supplier.name)
    private readonly supplierModel: Model<SupplierDocument>,
    @InjectModel(PurchaseInvoice.name)
    private readonly purchaseInvoiceModel: Model<PurchaseInvoiceDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly auditService: AuditService,
  ) {}

  public async create(dto: CreateSupplierDto, user: AuthUser): Promise<SupplierResponseDto> {
    const name = dto.name.trim();
    const phone = normalizeOptionalPhone(dto.phone);
    assertEgyptianMobile(phone);
    const address = normalizeOptionalAddress(dto.address);
    const amountOwed = roundMoney(dto.amountOwed ?? 0);

    if (phone) {
      const existing = await this.supplierModel
        .findOne({ phone: { $in: equivalentMobilePhones(phone) }, isDeleted: false })
        .lean()
        .exec();
      if (existing) {
        throw new ConflictException('Supplier phone already exists');
      }
    }

    const session = await this.connection.startSession();
    session.startTransaction();
    try {
      const [created] = await this.supplierModel.create(
        [
          {
            name,
            phone,
            address,
            amountOwed,
            isActive: true,
            isDeleted: false,
          },
        ],
        { session },
      );

      await this.auditService.log(
        {
          userId: user.id,
          action: 'supplier_created',
          entityType: 'Supplier',
          entityId: created._id.toString(),
          changes: {
            name: { old: null, new: created.name },
            phone: { old: null, new: created.phone },
            address: { old: null, new: created.address },
            amountOwed: { old: null, new: created.amountOwed },
            isActive: { old: null, new: true },
          },
          refCollection: null,
          refId: null,
          summary: `Supplier created: ${created.name}`,
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

  public async findAll(query: ListSuppliersQueryDto): Promise<SupplierListResponseDto> {
    const filter = this.buildListFilter(query);
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 10, 100);
    const skip = (page - 1) * limit;

    const [docs, total, summaryRows] = await Promise.all([
      this.supplierModel.find(filter).sort({ amountOwed: -1, name: 1 }).skip(skip).limit(limit).exec(),
      this.supplierModel.countDocuments(filter).exec(),
      this.supplierModel
        .aggregate<{ totalOwed: number }>([
          { $match: filter },
          { $group: { _id: null, totalOwed: { $sum: '$amountOwed' } } },
        ])
        .exec(),
    ]);

    return {
      items: docs.map((doc) => this.toResponseDto(doc)),
      meta: { page, limit, total },
      summary: { totalOwed: roundMoney(summaryRows[0]?.totalOwed ?? 0) },
    };
  }

  public async findOne(id: string): Promise<SupplierResponseDto> {
    const supplier = await this.supplierModel.findOne({ _id: id, isDeleted: false }).exec();
    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }
    return this.toResponseDto(supplier);
  }

  public async update(id: string, dto: UpdateSupplierDto, user: AuthUser): Promise<SupplierResponseDto> {
    const supplier = await this.supplierModel.findOne({ _id: id, isDeleted: false }).exec();
    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }

    const changes: Record<string, { old: unknown; new: unknown }> = {};

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (name !== supplier.name) {
        changes.name = { old: supplier.name, new: name };
        supplier.name = name;
      }
    }

    if (dto.phone !== undefined) {
      const phone = normalizeOptionalPhone(dto.phone);
      if (phone !== supplier.phone) {
        assertEgyptianMobile(phone);
        if (phone) {
          const existing = await this.supplierModel
            .findOne({ phone: { $in: equivalentMobilePhones(phone) }, isDeleted: false, _id: { $ne: supplier._id } })
            .lean()
            .exec();
          if (existing) {
            throw new ConflictException('Supplier phone already exists');
          }
        }
        changes.phone = { old: supplier.phone, new: phone };
        supplier.phone = phone;
      }
    }

    if (dto.address !== undefined) {
      const address = normalizeOptionalAddress(dto.address);
      if (address !== supplier.address) {
        changes.address = { old: supplier.address, new: address };
        supplier.address = address;
      }
    }

    if (dto.isActive !== undefined && dto.isActive !== supplier.isActive) {
      changes.isActive = { old: supplier.isActive, new: dto.isActive };
      supplier.isActive = dto.isActive;
    }

    if (Object.keys(changes).length === 0) {
      return this.toResponseDto(supplier);
    }

    const session = await this.connection.startSession();
    session.startTransaction();
    try {
      await supplier.save({ session });
      await this.auditService.log(
        {
          userId: user.id,
          action: 'supplier_edited',
          entityType: 'Supplier',
          entityId: supplier._id.toString(),
          changes,
          refCollection: null,
          refId: null,
          summary: `Supplier edited: ${supplier.name}`,
        },
        session,
      );
      await session.commitTransaction();
      return this.toResponseDto(supplier);
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  public async softDelete(id: string, user: AuthUser): Promise<SupplierResponseDto> {
    const supplier = await this.supplierModel.findOne({ _id: id, isDeleted: false }).exec();
    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }

    if (supplier.amountOwed !== 0) {
      throw new ConflictException('Supplier has outstanding amount owed, cannot be deleted');
    }

    const session = await this.connection.startSession();
    session.startTransaction();
    try {
      const oldIsActive = supplier.isActive;
      supplier.isDeleted = true;
      supplier.isActive = false;
      await supplier.save({ session });

      await this.auditService.log(
        {
          userId: user.id,
          action: 'supplier_deleted',
          entityType: 'Supplier',
          entityId: supplier._id.toString(),
          changes: {
            isDeleted: { old: false, new: true },
            isActive: { old: oldIsActive, new: false },
          },
          refCollection: null,
          refId: null,
          summary: `Supplier deleted: ${supplier.name}`,
        },
        session,
      );

      await session.commitTransaction();
      return this.toResponseDto(supplier);
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  public async merge(dto: MergeSuppliersDto, user: AuthUser): Promise<SupplierResponseDto> {
    if (dto.sourceIds.includes(dto.targetId)) {
      throw new BadRequestException('Source suppliers must not include the target supplier');
    }

    const target = await this.supplierModel.findOne({ _id: dto.targetId, isDeleted: false }).exec();
    if (!target) {
      throw new NotFoundException('Target supplier not found');
    }

    const sources = await this.supplierModel.find({ _id: { $in: dto.sourceIds }, isDeleted: false }).exec();

    if (sources.length !== dto.sourceIds.length) {
      throw new NotFoundException('One or more source suppliers were not found');
    }

    // Phase 6+: reassign PurchaseInvoice from each source → target in this same transaction.

    const oldTargetAmountOwed = target.amountOwed;
    const oldTargetName = target.name;
    const oldTargetPhone = target.phone;
    const sourcesAmountOwedSum = sources.reduce((sum, source) => sum + source.amountOwed, 0);

    if (dto.name !== undefined) {
      target.name = dto.name.trim();
    }

    if (dto.phone !== undefined) {
      const phone = normalizeOptionalPhone(dto.phone);
      if (phone !== target.phone) {
        assertEgyptianMobile(phone);
        if (phone) {
          const excludedIds = [target._id, ...sources.map((source) => source._id)];
          const existing = await this.supplierModel
            .findOne({
              phone: { $in: equivalentMobilePhones(phone) },
              isDeleted: false,
              _id: { $nin: excludedIds },
            })
            .lean()
            .exec();
          if (existing) {
            throw new ConflictException('Supplier phone already exists');
          }
        }
        target.phone = phone;
      }
    }

    target.amountOwed = roundMoney(oldTargetAmountOwed + sourcesAmountOwedSum);

    const sourceNames = sources.map((source) => source.name);
    const changes: Record<string, { old: unknown; new: unknown }> = {
      sourceIds: { old: null, new: sourceNames },
      targetId: { old: null, new: target.name },
      amountOwed: { old: oldTargetAmountOwed, new: target.amountOwed },
      sourcesAmountOwedSum: { old: sourcesAmountOwedSum, new: 0 },
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

      await this.purchaseInvoiceModel.updateMany(
        { supplierId: { $in: sourceObjectIds } },
        { $set: { supplierId: target._id } },
        { session },
      );

      for (const source of sources) {
        source.isDeleted = true;
        source.isActive = false;
        source.amountOwed = 0;
        await source.save({ session });
      }

      await target.save({ session });

      await this.auditService.log(
        {
          userId: user.id,
          action: 'supplier_merged',
          entityType: 'Supplier',
          entityId: target._id.toString(),
          changes,
          refCollection: null,
          refId: null,
          summary: `Suppliers merged: ${sourceNames.join(', ')} → ${target.name}`,
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
  private buildListFilter(query: ListSuppliersQueryDto): SupplierListFilter {
    const filter: SupplierListFilter = { isDeleted: false };

    if (query.hasDebt === true) {
      filter.amountOwed = { $gt: 0 };
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

  private toResponseDto(supplier: SupplierDocument): SupplierResponseDto {
    return {
      id: supplier._id.toString(),
      name: supplier.name,
      phone: supplier.phone,
      address: supplier.address ?? null,
      amountOwed: supplier.amountOwed,
      isActive: supplier.isActive,
      isDeleted: supplier.isDeleted,
      createdAt: supplier.get('createdAt') as Date | undefined,
      updatedAt: supplier.get('updatedAt') as Date | undefined,
    };
  }
}
